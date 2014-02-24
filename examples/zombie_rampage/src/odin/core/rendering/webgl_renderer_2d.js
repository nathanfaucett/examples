if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/event_emitter",
        "odin/base/device",
        "odin/base/dom",
        "odin/math/mathf",
        "odin/math/vec2",
        "odin/math/mat32",
        "odin/math/mat4",
        "odin/math/color",
        "odin/core/game/log",
        "odin/core/enums"
    ],
    function(EventEmitter, Device, Dom, Mathf, Vec2, Mat32, Mat4, Color, Log, Enums) {
        "use strict";


        var FontStyle = Enums.FontStyle,
            TextClipping = Enums.TextClipping,
            TextAnchor = Enums.TextAnchor,

            Blending = Enums.Blending,

            getWebGLContext = Dom.getWebGLContext,
            createProgram = Dom.createProgram,
            parseUniformsAttributes = Dom.parseUniformsAttributes,

            addEvent = Dom.addEvent,
            removeEvent = Dom.removeEvent,

            max = Math.max,
            clamp = Mathf.clamp,
            isPowerOfTwo = Mathf.isPowerOfTwo,

            WHITE_TEXTURE = new Uint8Array([255, 255, 255, 255]),
            ENUM_WHITE_TEXTURE = -1,

            SPRITE_VERTICES = [
                new Vec2(-0.5, 0.5),
                new Vec2(-0.5, -0.5),
                new Vec2(0.5, 0.5),
                new Vec2(0.5, -0.5)
            ],
            SPRITE_UVS = [
                new Vec2(0, 0),
                new Vec2(0, 1),
                new Vec2(1, 0),
                new Vec2(1, 1)
            ],
            ENUM_SPRITE_BUFFER = -1,

            SCREEN_VERTICES = [
                new Vec2(0, 0),
                new Vec2(0, 1),
                new Vec2(1, 0),
                new Vec2(1, 1)
            ],
            SCREEN_UVS = [
                new Vec2(0, 0),
                new Vec2(0, 1),
                new Vec2(1, 0),
                new Vec2(1, 1)
            ],
            ENUM_SCREEN_BUFFER = -2,

            ENUM_SPRITE_SHADER = -1,
            ENUM_BASIC_SHADER = -2,
            ENUM_PARTICLE_SHADER = -3,
            ENUM_CANVAS_SHADER = -4,

            EMPTY_ARRAY = [],

            MAT = new Mat32,
            MAT4 = new Mat4;


        /**
         * @class WebGLRenderer2D
         * @extends EventEmitter
         * @brief 2d webgl renderer
         * @param Object options
         */

        function WebGLRenderer2D(opts) {
            opts || (opts = {});

            EventEmitter.call(this);

            this.canvas = undefined;
            this.context = undefined;
            this._context = false;

            this.autoClear = opts.autoClear != undefined ? opts.autoClear : true;

            this.attributes = merge(opts.attributes || {}, {
                alpha: true,
                antialias: true,
                depth: true,
                premulipliedAlpha: true,
                preserveDrawingBuffer: false,
                stencil: true
            });

            this._webgl = {
                gpu: {
                    precision: "highp",
                    maxAnisotropy: 16,
                    maxTextures: 16,
                    maxTextureSize: 16384,
                    maxCubeTextureSize: 16384,
                    maxRenderBufferSize: 16384
                },
                ext: {
                    textureFilterAnisotropic: undefined,
                    textureFloat: undefined,
                    standardDerivatives: undefined,
                    compressedTextureS3TC: undefined
                },

                textures: {},
                shaders: {},
                buffers: {},
                texts: {},
                textsTextureCache: {},

                lastTexture: undefined,
                lastShader: undefined,
                lastBuffer: undefined
            };

            this._clearBytes = 17664;
            this._lastCamera = undefined;
            this._lastResizeFn = undefined;
            this._lastBackground = new Color;

            this._lastBlending = undefined;
        }

        EventEmitter.extend(WebGLRenderer2D);


        WebGLRenderer2D.prototype.init = function(canvas) {
            if (this.canvas) this.clear();
            var element = canvas.element;

            this.canvas = canvas;
            this.context = getWebGLContext(element, this.attributes);

            if (!this.context) return this;
            this._context = true;

            addEvent(element, "webglcontextlost", this._handleWebGLContextLost, this);
            addEvent(element, "webglcontextrestored", this._handleWebGLContextRestored, this);

            this.setDefaults();

            return this;
        };


        WebGLRenderer2D.prototype.clear = function() {
            if (!this.canvas) return this;
            var canvas = this.canvas,
                element = canvas.element,
                webgl = this._webgl,
                ext = webgl.ext;

            this.canvas = undefined;
            this.context = undefined;
            this._context = false;

            removeEvent(element, "webglcontextlost", this._handleWebGLContextLost, this);
            removeEvent(element, "webglcontextrestored", this._handleWebGLContextRestored, this);

            this._clearBytes = 17664;
            this._lastCamera = undefined;
            this._lastBackground.setRGB(0, 0, 0);
            this._lastBlending = undefined;

            ext.compressedTextureS3TC = ext.standardDerivatives = ext.textureFilterAnisotropic = ext.textureFloat = undefined;
            webgl.lastBuffer = webgl.lastShader = webgl.lastTexture = undefined;
            clear(webgl.textures);
            clear(webgl.buffers);
            clear(webgl.shaders);
            clear(webgl.texts);
            clear(webgl.textsTextureCache);

            return this;
        };

        /**
         * @method setDefaults
         * @memberof WebGLRenderer2D
         * @brief sets renderers defaults settings
         */
        WebGLRenderer2D.prototype.setDefaults = function() {
            var gl = this.context,
                webgl = this._webgl,
                ext = webgl.ext,
                gpu = webgl.gpu,

                textureFilterAnisotropic = gl.getExtension("EXT_texture_filter_anisotropic") ||
                    gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
                    gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic"),

                compressedTextureS3TC = gl.getExtension("WEBGL_compressed_texture_s3tc") ||
                    gl.getExtension("MOZ_WEBGL_compressed_texture_s3tc") ||
                    gl.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc"),

                standardDerivatives = gl.getExtension("OES_standard_derivatives"),

                textureFloat = gl.getExtension("OES_texture_float");

            ext.textureFilterAnisotropic = textureFilterAnisotropic;
            ext.standardDerivatives = standardDerivatives;
            ext.textureFloat = textureFloat;
            ext.compressedTextureS3TC = compressedTextureS3TC;

            var VERTEX_SHADER = gl.VERTEX_SHADER,
                FRAGMENT_SHADER = gl.FRAGMENT_SHADER,
                HIGH_FLOAT = gl.HIGH_FLOAT,
                MEDIUM_FLOAT = gl.MEDIUM_FLOAT,

                shaderPrecision = typeof(gl.getShaderPrecisionFormat) !== "undefined",

                maxAnisotropy = ext.textureFilterAnisotropic ? gl.getParameter(ext.textureFilterAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1,

                maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),

                maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE),

                maxCubeTextureSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),

                maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),

                vsHighpFloat = shaderPrecision ? gl.getShaderPrecisionFormat(VERTEX_SHADER, HIGH_FLOAT) : 0,
                vsMediumpFloat = shaderPrecision ? gl.getShaderPrecisionFormat(VERTEX_SHADER, MEDIUM_FLOAT) : 1,

                fsHighpFloat = shaderPrecision ? gl.getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT) : 0,
                fsMediumpFloat = shaderPrecision ? gl.getShaderPrecisionFormat(FRAGMENT_SHADER, MEDIUM_FLOAT) : 1,

                highpAvailable = vsHighpFloat.precision > 0 && fsHighpFloat.precision > 0,
                mediumpAvailable = vsMediumpFloat.precision > 0 && fsMediumpFloat.precision > 0,

                precision = "highp";

            if (!highpAvailable || Device.mobile) {
                if (mediumpAvailable) {
                    precision = "mediump";
                } else {
                    precision = "lowp";
                }
            }

            gpu.precision = precision;
            gpu.maxAnisotropy = maxAnisotropy;
            gpu.maxTextures = maxTextures;
            gpu.maxTextureSize = maxTextureSize;
            gpu.maxCubeTextureSize = maxCubeTextureSize;
            gpu.maxRenderBufferSize = maxRenderBufferSize;

            gl.clearColor(0, 0, 0, 1);
            gl.clearDepth(1);
            gl.clearStencil(0);

            //gl.enable(gl.DEPTH_TEST);
            //gl.depthFunc(gl.LEQUAL);

            gl.frontFace(gl.CCW);
            gl.cullFace(gl.BACK);
            gl.enable(gl.CULL_FACE);

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

            this.setBlending(Blending.Default);

            gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

            var texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, WHITE_TEXTURE);
            gl.bindTexture(gl.TEXTURE_2D, null);
            webgl.textures[ENUM_WHITE_TEXTURE] = texture;

            buildBuffer(this, {
                _id: ENUM_SPRITE_BUFFER,
                vertices: SPRITE_VERTICES,
                uvs: SPRITE_UVS
            });
            buildBuffer(this, {
                _id: ENUM_SCREEN_BUFFER,
                vertices: SCREEN_VERTICES,
                uvs: SCREEN_UVS
            });

            buildShader(this, {
                _id: ENUM_SPRITE_SHADER,
                vertexShader: spriteVertexShader(precision),
                fragmentShader: spriteFragmentShader(precision)
            });
            buildShader(this, {
                _id: ENUM_CANVAS_SHADER,
                vertexShader: guiVertexShader(precision),
                fragmentShader: spriteFragmentShader(precision)
            });
            buildShader(this, {
                _id: ENUM_BASIC_SHADER,
                vertexShader: basicVertexShader(precision),
                fragmentShader: basicFragmentShader(precision)
            });
            buildShader(this, {
                _id: ENUM_PARTICLE_SHADER,
                vertexShader: particleVertexShader(precision),
                fragmentShader: particleFragmentShader(precision)
            });

            this._clearBytes = gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT;

            return this;
        };

        /**
         * @method setBlending
         * @memberof WebGLRenderer2D
         * @param Number blending
         */
        WebGLRenderer2D.prototype.setBlending = function(blending) {
            var gl = this.context;

            if (blending !== this._lastBlending) {

                switch (blending) {
                    case Blending.None:
                        gl.disable(gl.BLEND);
                        break;

                    case Blending.Additive:
                        gl.enable(gl.BLEND);
                        gl.blendEquation(gl.FUNC_ADD);
                        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                        break;

                    case Blending.Subtractive:
                        gl.enable(gl.BLEND);
                        gl.blendEquation(gl.FUNC_ADD);
                        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
                        break;

                    case Blending.Muliply:
                        gl.enable(gl.BLEND);
                        gl.blendEquation(gl.FUNC_ADD);
                        gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
                        break;

                    case Blending.Default:
                    default:
                        gl.enable(gl.BLEND);
                        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
                        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                        break;
                }

                this._lastBlending = blending;
            }
        };


        WebGLRenderer2D.prototype.preRender = function(camera) {
            if (!this._context) return;
            var gl = this.context,
                lastBackground = this._lastBackground,
                background = camera.background;

            if (lastBackground.r !== background.r || lastBackground.g !== background.g || lastBackground.b !== background.b) {
                lastBackground.copy(background);
                gl.clearColor(background.r, background.g, background.b, 1);
                if (!this.autoClear) gl.clear(this._clearBytes);
            }
            if (this._lastCamera !== camera) {
                var canvas = this.canvas,
                    w = canvas.pixelWidth,
                    h = canvas.pixelHeight;

                camera.set(w, h);
                gl.viewport(0, 0, w, h);

                if (this._lastResizeFn) canvas.off("resize", this._lastResizeFn);

                this._lastResizeFn = function() {
                    var w = this.pixelWidth,
                        h = this.pixelHeight;

                    camera.set(w, h);
                    gl.viewport(0, 0, w, h);
                };

                canvas.on("resize", this._lastResizeFn);
                this._lastCamera = camera;
            }

            if (this.autoClear) gl.clear(this._clearBytes);
        };


        WebGLRenderer2D.prototype.renderGUI = function(gui, camera) {
            if (!this._context) return;
            var gl = this.context,
                components = gui.components,
                GUIContent = components.GUIContent || EMPTY_ARRAY,
                content, transform,
                i;

            for (i = GUIContent.length; i--;) {
                content = GUIContent[i];
                transform = content.guiTransform;

                if (!transform) continue;

                this.renderGUIContent(camera, transform, content);
            }
        };


        WebGLRenderer2D.prototype.renderGUIContent = function(camera, transform, content) {
            var gl = this.context,
                webgl = this._webgl,

                position = transform.position,
                text = content.text,
                texture = content.texture,
                style = content.style,
                state = style[style._state],
                background = state.background,

                glShader = webgl.shaders[ENUM_BASIC_SHADER],
                glBuffer = webgl.buffers[ENUM_SCREEN_BUFFER],
                uniforms = glShader.uniforms,

                aspect = camera.aspect,
                width = position.width,
                height = position.height,

                glText, texture;

            MAT4.copy(SCREEN_MAT).translate(position);

            if (aspect >= 1) {
                width /= aspect;
            } else {
                height *= aspect;
            }

            if (webgl.lastShader !== glShader) {
                gl.useProgram(glShader.program);
                webgl.lastShader = glShader;
            }
            if (webgl.lastBuffer !== glBuffer) {
                bindBuffers(gl, glShader, glBuffer);
                webgl.lastBuffer = glBuffer;
            }

            gl.uniformMatrix4fv(uniforms.uMatrix.location, false, MAT4.elements);
            gl.uniform3f(uniforms.uColor.location, background.r, background.g, background.b);
            gl.uniform1f(uniforms.uAlpha.location, content.alpha);
            gl.uniform2f(uniforms.uSize.location, width, height);

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, glBuffer.vertices);

            if (text) {
                glShader = webgl.shaders[ENUM_CANVAS_SHADER];
                uniforms = glShader.uniforms;

                gl.useProgram(glShader.program);
                bindBuffers(gl, glShader, glBuffer);

                glText = buildText(this, camera, position, content, style, state, text);
                texture = glText.texture;

                if (texture) {
                    if (webgl.lastTexture !== texture) {
                        gl.activeTexture(gl.TEXTURE0);
                        gl.bindTexture(gl.TEXTURE_2D, texture);
                        gl.uniform1i(uniforms.uTexture.location, 0);

                        webgl.lastTexture = texture;
                    }

                    gl.uniformMatrix4fv(uniforms.uMatrix.location, false, MAT4.elements);
                    gl.uniform1f(uniforms.uAlpha.location, content.alpha);
                    gl.uniform2f(uniforms.uSize.location, glText.width, glText.height);

                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, glBuffer.vertices);
                }
            }
        };


        var SPLITTER = /[\r\n]+/,
            TOP = "top",
            LEFT = "left",
            CENTER = "center",
            RIGHT = "right";

        function buildText(renderer, camera, position, content, style, state, text) {
            var gl = renderer.context,
                webgl = renderer._webgl,
                texts = webgl.texts,
                textsTextureCache = webgl.textsTextureCache,
                glText = texts[content._id];

            if (glText && !content.needsUpdate) return glText;
            glText = glText || (texts[content._id] = {});

            var canvas = glText.canvas || document.createElement("canvas"),
                ctx = glText.ctx || canvas.getContext("2d"),
                texture = textsTextureCache[content._id] || (textsTextureCache[content._id] = {
                    _id: content._id,
                    needsUpdate: true,
                    raw: canvas
                }),
                font = style.fontStyle + " " + style.fontSize + "pt " + style.font,
                wordWrap = style.wordWrap,
                lineHeight = style.lineHeight,
                width = 0,
                height = 0,
                lines, lineWidth, i, il;

            lines = text.split(SPLITTER);
            for (i = 0, il = lines.length; i < il; i++) {
                lineWidth = ctx.measureText(lines[i]).width;
                width = max(width, lineWidth);
            }
            height = lineHeight ? lineHeight * il : (lineHeight = determineFontHeight(font)) * il;

            canvas.width = width;
            canvas.height = height;

            ctx.fillStyle = state.text.toRGB();
            ctx.font = font;
            ctx.textBaseline = TOP;

            switch (style.alignment) {
                case TextAnchor.Left:
                    ctx.textAlign = LEFT;
                    break;
                case TextAnchor.Center:
                    ctx.textAlign = CENTER;
                    break;
                case TextAnchor.Right:
                    ctx.textAlign = RIGHT;
                    break;
            }

            for (i = 0; i < il; i++) ctx.fillText(lines[i], 0, lineHeight * i);

            glText.canvas = canvas;
            glText.ctx = ctx;
            glText.width = width * camera.invWidth;
            glText.height = height * camera.invHeight;

            texture.needsUpdate = true;
            glText.texture = buildTexture(renderer, texture);

            content.needsUpdate = false;

            return glText;
        }

        var HEIGHT_CACHE = {};

        function determineFontHeight(font) {
            var result = HEIGHT_CACHE[font];

            if (!result) {
                var body = document.getElementsByTagName("body")[0],
                    dummy = document.createElement("div"),
                    dummyText = document.createTextNode("M");

                dummy.appendChild(dummyText);
                dummy.setAttribute("style", "font: " + font + ";position:absolute;top:0;left:0");
                body.appendChild(dummy);

                result = dummy.offsetHeight;
                HEIGHT_CACHE[font] = result;

                body.removeChild(dummy);
            }

            return result;
        }


        /**
         * @method render
         * @memberof WebGLRenderer2D
         * @brief renderers scene from camera's perspective
         * @param Scene scene
         * @param Camera camera
         */

        WebGLRenderer2D.prototype.render = function(scene, camera) {
            if (!this._context) return;
            var gl = this.context,
                components = scene.components,
                sprites = components.Sprite || EMPTY_ARRAY,
                particleSystems = components.ParticleSystem || EMPTY_ARRAY,
                guiTextures = components.GUITexture || EMPTY_ARRAY,
                sprite2d, particleSystem, guiTexture, transform2d,
                i;

            for (i = sprites.length; i--;) {
                sprite2d = sprites[i];
                transform2d = sprite2d.transform2d;

                if (!transform2d || !sprite2d.visible) continue;

                transform2d.updateModelViewMat32(camera.view);
                this.renderSprite(camera, transform2d, sprite2d);
            }

            for (i = particleSystems.length; i--;) {
                particleSystem = particleSystems[i];
                transform2d = particleSystem.transform2d;

                if (!transform2d) continue;

                transform2d.updateModelViewMat32(camera.view);
                this.renderParticleSystem(camera, transform2d, particleSystem);
            }

            for (i = guiTextures.length; i--;) {
                guiTexture = guiTextures[i];
                transform2d = guiTexture.transform2d;

                if (!transform2d) continue;

                this.renderGUITexture(camera, transform2d, guiTexture);
            }
        };


        var SCREEN_MAT = new Mat4().orthographic(0, 1, 0, 1, -1, 1);
        WebGLRenderer2D.prototype.renderGUITexture = function(camera, transform2d, guiTexture) {
            var gl = this.context,
                webgl = this._webgl,
                texture = guiTexture.texture,
                position = guiTexture.position,

                glShader = webgl.shaders[ENUM_SPRITE_SHADER],
                glBuffer = webgl.buffers[ENUM_SCREEN_BUFFER],
                glTexture = buildTexture(this, texture),
                uniforms = glShader.uniforms,

                aspect = camera.aspect,

                width = position.width,
                height = position.height,
                w, h;

            if (texture && texture.raw) {
                w = texture.invWidth;
                h = texture.invHeight;
            } else {
                return;
            }

            MAT4.copy(SCREEN_MAT).translate(position);

            if (aspect >= 1) {
                height *= aspect;
            } else {
                width /= aspect;
            }

            if (webgl.lastShader !== glShader) {
                gl.useProgram(glShader.program);
                webgl.lastShader = glShader;
            }
            if (webgl.lastBuffer !== glBuffer) {
                bindBuffers(gl, glShader, glBuffer);
                webgl.lastBuffer = glBuffer;
            }
            gl.uniformMatrix4fv(uniforms.uMatrix.location, false, MAT4.elements);
            gl.uniform4f(uniforms.uCrop.location, guiTexture.x * w, guiTexture.y * h, guiTexture.w * w, guiTexture.h * h);
            gl.uniform2f(uniforms.uSize.location, width, height);
            gl.uniform1f(uniforms.uAlpha.location, guiTexture.alpha);

            if (webgl.lastTexture !== glTexture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, glTexture);
                gl.uniform1i(uniforms.uTexture.location, 0);

                webgl.lastTexture = glTexture;
            }

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, glBuffer.vertices);
        };


        WebGLRenderer2D.prototype.renderSprite = function(camera, transform2d, sprite2d) {
            var gl = this.context,
                webgl = this._webgl,
                texture = sprite2d.texture,

                glShader = webgl.shaders[ENUM_SPRITE_SHADER],
                glBuffer = webgl.buffers[ENUM_SPRITE_BUFFER],
                glTexture = buildTexture(this, texture),
                uniforms = glShader.uniforms,
                w, h;

            if (texture && texture.raw) {
                w = texture.invWidth;
                h = texture.invHeight;
            } else {
                return;
            }

            MAT4.mmul(camera._projectionMat4, MAT4.fromMat32(transform2d.modelView));

            if (webgl.lastShader !== glShader) {
                gl.useProgram(glShader.program);
                webgl.lastShader = glShader;
            }
            if (webgl.lastBuffer !== glBuffer) {
                bindBuffers(gl, glShader, glBuffer);
                webgl.lastBuffer = glBuffer;
            }
            gl.uniformMatrix4fv(uniforms.uMatrix.location, false, MAT4.elements);
            gl.uniform4f(uniforms.uCrop.location, sprite2d.x * w, sprite2d.y * h, sprite2d.w * w, sprite2d.h * h);
            gl.uniform2f(uniforms.uSize.location, sprite2d.width, sprite2d.height);
            gl.uniform1f(uniforms.uAlpha.location, sprite2d.alpha);

            if (webgl.lastTexture !== glTexture) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, glTexture);
                gl.uniform1i(uniforms.uTexture.location, 0);

                webgl.lastTexture = glTexture;
            }

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, glBuffer.vertices);
        };


        WebGLRenderer2D.prototype.renderParticleSystem = function(camera, transform2d, particleSystem) {
            var gl = this.context,
                webgl = this._webgl,

                glShader = webgl.shaders[ENUM_PARTICLE_SHADER],
                glBuffer = webgl.buffers[ENUM_SPRITE_BUFFER],

                vertices = glBuffer.vertices,
                TRIANGLE_STRIP = gl.TRIANGLE_STRIP,

                uniforms = glShader.uniforms,
                uMatrix = uniforms.uMatrix.location,
                uPos = uniforms.uPos.location,
                uAngle = uniforms.uAngle.location,
                uSize = uniforms.uSize.location,
                uColor = uniforms.uColor.location,
                uAlpha = uniforms.uAlpha.location,

                elements = MAT4.elements,
                blending = this._lastBlending,

                emitters = particleSystem.emitters,
                emitter, particles, view, particle, pos, color, glTexture,
                i = emitters.length,
                j;

            if (!i) return;

            for (; i--;) {
                emitter = emitters[i];

                particles = emitter.particles;
                view = emitter.worldSpace ? camera.view : transform2d.modelView;

                if (!(j = particles.length)) continue;
                glTexture = buildTexture(this, emitter.texture);

                if (webgl.lastShader !== glShader) {
                    gl.useProgram(glShader.program);
                    webgl.lastShader = glShader;
                }
                if (webgl.lastBuffer !== glBuffer) {
                    bindBuffers(gl, glShader, glBuffer);
                    webgl.lastBuffer = glBuffer;
                }
                this.setBlending(emitter.blending);

                MAT4.mmul(camera._projectionMat4, MAT4.fromMat32(view));
                gl.uniformMatrix4fv(uMatrix, false, elements);

                if (webgl.lastTexture !== glTexture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, glTexture);
                    gl.uniform1i(uniforms.uTexture.location, 0);

                    webgl.lastTexture = glTexture;
                }

                for (; j--;) {
                    particle = particles[j];
                    pos = particle.position;
                    color = particle.color;

                    gl.uniform2f(uPos, pos.x, pos.y);
                    gl.uniform1f(uAngle, particle.angle);
                    gl.uniform1f(uSize, particle.size);
                    gl.uniform3f(uColor, color.r, color.g, color.b);
                    gl.uniform1f(uAlpha, particle.alpha);

                    gl.drawArrays(TRIANGLE_STRIP, 0, vertices);
                }
            }
            this.setBlending(blending);
        };


        WebGLRenderer2D.prototype._handleWebGLContextLost = function(e) {
            e.preventDefault();
            Log.warn("WebGLRenderer2D: webgl context was lost");

            this._context = false;
            this.emit("webglcontextlost", e);
        };


        WebGLRenderer2D.prototype._handleWebGLContextRestored = function(e) {
            Log.log("WebGLRenderer2D: webgl context was restored");

            this.setDefaults();

            this._context = true;
            this.emit("webglcontextrestored", e);
        };


        function bindBuffers(gl, glShader, glBuffer) {
            var attributes = glShader.attributes,
                FLOAT = gl.FLOAT,
                ARRAY_BUFFER = gl.ARRAY_BUFFER;

            if (glBuffer.vertex && attributes.aVertexPosition > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.vertex);
                gl.enableVertexAttribArray(attributes.aVertexPosition);
                gl.vertexAttribPointer(attributes.aVertexPosition, 2, FLOAT, false, 0, 0);
            }

            if (glBuffer.color && attributes.aVertexColor > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.color);
                gl.enableVertexAttribArray(attributes.aVertexColor);
                gl.vertexAttribPointer(attributes.aVertexColor, 2, FLOAT, false, 0, 0);
            }

            if (glBuffer.uv && attributes.aVertexUv > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.uv);
                gl.enableVertexAttribArray(attributes.aVertexUv);
                gl.vertexAttribPointer(attributes.aVertexUv, 2, FLOAT, false, 0, 0);
            }

            if (glBuffer.index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer.index);
        }


        var COMPILE_ARRAY = [];

        function buildBuffer(renderer, buffer) {
            if (!buffer) return undefined;
            var gl = renderer.context,
                webgl = renderer._webgl,
                buffers = webgl.buffers,
                glBuffer = buffers[buffer._id];

            if (glBuffer && !buffer.needsUpdate) return glBuffer;
            glBuffer = glBuffer || (buffers[buffer._id] = {});

            var compileArray = COMPILE_ARRAY,
                DRAW = buffer.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
                ARRAY_BUFFER = gl.ARRAY_BUFFER,
                ELEMENT_ARRAY_BUFFER = gl.ELEMENT_ARRAY_BUFFER,
                items, item,
                i, il;

            items = buffer.vertices;
            if (items && items.length) {
                compileArray.length = 0;

                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.x, item.y);
                }
                if (compileArray.length) {
                    glBuffer.vertex = glBuffer.vertex || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffer.vertex);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }

                glBuffer.vertices = items.length;
            }

            items = buffer.uvs;
            if (items && items.length) {
                compileArray.length = 0;

                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.x, item.y);
                }
                if (compileArray.length) {
                    glBuffer.uv = glBuffer.uv || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffer.uv);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
            }

            items = buffer.indices || buffer.faces;
            if (items && items.length) {
                glBuffer.index = glBuffer.index || gl.createBuffer();
                gl.bindBuffer(ELEMENT_ARRAY_BUFFER, glBuffer.index);
                gl.bufferData(ELEMENT_ARRAY_BUFFER, new Int16Array(items), DRAW);

                glBuffer.indices = items.length;
            }

            return glBuffer;
        }


        function buildShader(renderer, shader) {
            var gl = renderer.context,
                webgl = renderer._webgl,
                shaders = webgl.shaders,
                glShader = shaders[shader._id],
                vertex, fragment;

            if (glShader && !shader.needsUpdate) return glShader;

            glShader = glShader || (shaders[shader._id] = {});
            vertex = shader.vertex || shader.vertexShader;
            fragment = shader.fragment || shader.fragmentShader;

            var program = glShader.program = createProgram(gl, vertex, fragment);

            glShader.vertex = vertex;
            glShader.fragment = fragment;

            parseUniformsAttributes(gl, program, vertex, fragment,
                glShader.attributes || (glShader.attributes = {}),
                glShader.uniforms || (glShader.uniforms = {})
            );

            return glShader;
        }


        function buildTexture(renderer, texture) {
            if (!texture || !texture.raw) return renderer._webgl.textures[ENUM_WHITE_TEXTURE];

            var gl = renderer.context,
                webgl = renderer._webgl,
                textures = webgl.textures,
                glTexture = textures[texture._id],
                raw = texture.raw;

            if (glTexture && !texture.needsUpdate) return glTexture;
            glTexture = glTexture || (textures[texture._id] = gl.createTexture());

            var ext = webgl.ext,
                gpu = webgl.gpu,
                TFA = ext.textureFilterAnisotropic,

                isPOT = isPowerOfTwo(raw.width) && isPowerOfTwo(raw.height),
                anisotropy = texture.anisotropy != undefined ? clamp(texture.anisotropy, 1, gpu.maxAnisotropy) : 1,

                TEXTURE_2D = gl.TEXTURE_2D,
                WRAP = isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE,
                MAG_FILTER = gl[texture.magFilter] || gl.LINEAR,
                MIN_FILTER = gl[texture.minFilter] || gl.LINEAR,
                FORMAT = gl[texture.format];

            FORMAT = FORMAT ? FORMAT : gl.RGBA;

            if (isPOT) {
                MIN_FILTER = MIN_FILTER === gl.NEAREST || MIN_FILTER === gl.LINEAR ? gl.LINEAR_MIPMAP_NEAREST : MIN_FILTER;
            } else {
                MIN_FILTER = MIN_FILTER === gl.NEAREST ? gl.NEAREST : gl.LINEAR;
            }

            gl.bindTexture(TEXTURE_2D, glTexture);

            gl.texImage2D(TEXTURE_2D, 0, FORMAT, FORMAT, gl.UNSIGNED_BYTE, raw);

            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_MAG_FILTER, MAG_FILTER);
            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_MIN_FILTER, MIN_FILTER);

            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAP);
            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAP);

            if (TFA) gl.texParameterf(TEXTURE_2D, TFA.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
            if (isPOT) gl.generateMipmap(TEXTURE_2D);

            webgl.lastTexture = glTexture;
            texture.needsUpdate = false;

            return glTexture;
        }


        function particleVertexShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform mat4 uMatrix;",
                "uniform vec2 uPos;",
                "uniform float uAngle;",
                "uniform float uSize;",

                "attribute vec2 aVertexPosition;",
                "attribute vec2 aVertexUv;",

                "varying vec2 vVertexUv;",

                "void main() {",
                "	float c, s, vx, vy, x, y;",

                "	c = cos(uAngle);",
                "	s = sin(uAngle);",
                "	vx = aVertexPosition.x;",
                "	vy = aVertexPosition.y;",

                "	x = vx * c - vy * s;",
                "	y = vx * s + vy * c;",

                "	vVertexUv = aVertexUv;",
                "	gl_Position = uMatrix * vec4(uPos.x + x * uSize, uPos.y + y * uSize, 0.0, 1.0);",
                "}"
            ].join("\n");
        }


        function particleFragmentShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform float uAlpha;",
                "uniform vec3 uColor;",
                "uniform sampler2D uTexture;",

                "varying vec2 vVertexUv;",

                "void main() {",
                "	vec4 finalColor = texture2D(uTexture, vVertexUv);",
                "	finalColor.xyz *= uColor;",
                "	finalColor.w *= uAlpha;",

                "	gl_FragColor = finalColor;",
                "}"
            ].join("\n");
        }


        function basicVertexShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform mat4 uMatrix;",
                "uniform vec2 uSize;",

                "attribute vec2 aVertexPosition;",

                "void main() {",

                "	gl_Position = uMatrix * vec4(aVertexPosition * uSize, 0.0, 1.0);",
                "}"
            ].join("\n");
        }


        function basicFragmentShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform float uAlpha;",
                "uniform vec3 uColor;",

                "void main() {",
                "	gl_FragColor = vec4(uColor, uAlpha);",
                "}"
            ].join("\n");
        }


        function guiVertexShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform mat4 uMatrix;",
                "uniform vec2 uSize;",

                "attribute vec2 aVertexPosition;",
                "attribute vec2 aVertexUv;",

                "varying vec2 vVertexUv;",

                "void main() {",

                "	vVertexUv = vec2(aVertexUv.x, aVertexUv.y);",
                "	gl_Position = uMatrix * vec4(aVertexPosition * uSize, 0.0, 1.0);",
                "}"
            ].join("\n");
        }


        function spriteVertexShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform mat4 uMatrix;",
                "uniform vec4 uCrop;",
                "uniform vec2 uSize;",

                "attribute vec2 aVertexPosition;",
                "attribute vec2 aVertexUv;",

                "varying vec2 vVertexUv;",

                "void main() {",

                "	vVertexUv = vec2(aVertexUv.x * uCrop.z, aVertexUv.y * uCrop.w) + uCrop.xy;",
                "	gl_Position = uMatrix * vec4(aVertexPosition * uSize, 0.0, 1.0);",
                "}"
            ].join("\n");
        }


        function spriteFragmentShader(precision) {

            return [
                "precision " + precision + " float;",

                "uniform float uAlpha;",
                "uniform sampler2D uTexture;",

                "varying vec2 vVertexUv;",

                "void main() {",
                "	vec4 finalColor = texture2D(uTexture, vVertexUv);",
                "	finalColor.w *= uAlpha;",

                "	gl_FragColor = finalColor;",
                "}"
            ].join("\n");
        }


        function merge(obj, add) {
            var key;

            for (key in add)
                if (obj[key] == undefined) obj[key] = add[key];

            return obj;
        }

        function clear(obj) {
            var key;

            for (key in obj) delete obj[key];

            return obj;
        }


        return WebGLRenderer2D;
    }
);
