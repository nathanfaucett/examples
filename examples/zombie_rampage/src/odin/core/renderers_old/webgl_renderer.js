if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/event_emitter",
        "odin/base/device",
        "odin/base/dom",
        "odin/base/util",
        "odin/math/mathf",
        "odin/math/rect",
        "odin/math/vec2",
        "odin/math/vec3",
        "odin/math/mat4",
        "odin/math/color",
        "odin/core/game/log",
        "odin/core/enums"
    ],
    function(EventEmitter, Device, Dom, util, Mathf, Rect, Vec2, Vec3, Mat4, Color, Log, Enums) {
        "use strict";


        var Blending = Enums.Blending,

            getWebGLContext = Dom.getWebGLContext,
            createProgram = Dom.createProgram,
            parseUniformsAttributes = Dom.parseUniformsAttributes,

            addEvent = Dom.addEvent,
            removeEvent = Dom.removeEvent,

            merge = util.merge,
            clear = util.clear,

            clamp = Mathf.clamp,
            isPowerOfTwo = Mathf.isPowerOfTwo,

            SPRITE_VERTICES = [
                new Vec3(-0.5, 0.5, 0),
                new Vec3(-0.5, -0.5, 0),
                new Vec3(0.5, 0.5, 0),
                new Vec3(0.5, -0.5, 0)
            ],
            SPRITE_UVS = [
                new Vec2(0, 0),
                new Vec2(0, 1),
                new Vec2(1, 0),
                new Vec2(1, 1)
            ],
            ENUM_SPRITE_BUFFER = -1,

            WHITE_TEXTURE = new Uint8Array([255, 255, 255, 255]),

            ENUM_WHITE_TEXTURE = -1,

            ENUM_WIREFRAME_SHADER = -1,

            EMPTY_ARRAY = [];


        /**
         * @class WebGLRenderer
         * @extends EventEmitter
         * @brief 2d webgl renderer
         * @param Object options
         */

        function WebGLRenderer(opts) {
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
                buffers: {},
                shaders: {},

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

        EventEmitter.extend(WebGLRenderer);


        WebGLRenderer.prototype.init = function(canvas) {
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


        WebGLRenderer.prototype.clear = function() {
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

            return this;
        };

        /**
         * @method setDefaults
         * @memberof WebGLRenderer
         * @brief sets renderers defaults settings
         */
        WebGLRenderer.prototype.setDefaults = function() {
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

            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);

            gl.frontFace(gl.CCW);
            gl.cullFace(gl.BACK);
            gl.enable(gl.CULL_FACE);

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

            this.setBlending(Blending.Default);

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

            this.buildBuffer({
                _id: ENUM_SPRITE_BUFFER,
                vertices: SPRITE_VERTICES,
                uvs: SPRITE_UVS
            });
            this.buildShader(null, {
                _id: ENUM_WIREFRAME_SHADER,
                vertex: wireframe.vertex,
                fragment: wireframe.fragment
            });

            var texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, WHITE_TEXTURE);
            gl.bindTexture(gl.TEXTURE_2D, null);
            webgl.textures[ENUM_WHITE_TEXTURE] = texture;

            this._clearBytes = gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT;

            return this;
        };

        /**
         * @method setBlending
         * @memberof WebGLRenderer
         * @param Number blending
         */
        WebGLRenderer.prototype.setBlending = function(blending) {
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


        WebGLRenderer.prototype.preRender = function(camera) {
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


        WebGLRenderer.prototype.renderGUI = function(gui, camera) {
            if (!this._context) return;
            var gl = this.context,
                components = gui.components,
                transform,
                i;

        };


        /**
         * @method render
         * @memberof WebGLRenderer
         * @brief renderers scene from camera's perspective
         * @param Scene scene
         * @param Camera camera
         */
        WebGLRenderer.prototype.render = function(scene, camera) {
            if (!this._context) return;

            var gl = this.context,
                components = scene.components,
                sprites = components.Sprite || EMPTY_ARRAY,
                meshFilters = components.MeshFilter || EMPTY_ARRAY,
                sprite, meshFilter, particleSystem, transform,
                i;

            for (i = sprites.length; i--;) {
                sprite = sprites[i];
                transform = sprite.transform;

                if (!transform && !sprite.visible) continue;

                transform.updateModelView(camera.view);
                this.renderSprite(camera, transform, sprite);
            }

            for (i = meshFilters.length; i--;) {
                meshFilter = meshFilters[i];
                transform = meshFilter.transform;

                if (!transform) continue;

                transform.updateModelView(camera.view);
                this.renderMeshFilter(camera, transform, meshFilter);
            }
        };


        WebGLRenderer.prototype.renderSprite = function(camera, transform, sprite) {
            var gl = this.context,
                webgl = this._webgl,

                material = sprite.material,
                wireframe = material.wireframe,
                glShader = wireframe ? webgl.shaders[ENUM_WIREFRAME_SHADER] : this.buildShader(sprite, material.shader),
                glBuffer = webgl.buffers[ENUM_SPRITE_BUFFER],
                uniforms, materialUniforms, texture, w, h;

            if (!glShader) return;

            uniforms = glShader.uniforms;
            materialUniforms = material.uniforms;

            if (uniforms.mvpMatrix) materialUniforms.mvpMatrix.mmul(camera.projection, transform.modelView);
            if (uniforms.modelMatrix) materialUniforms.modelMatrix.copy(transform.matrixWorld);
            if (uniforms.modelViewMatrix) materialUniforms.modelViewMatrix.copy(transform.modelView);
            if (uniforms.projectionMatrix) materialUniforms.projectionMatrix.copy(camera.projection);
            if (uniforms.viewMatrix) materialUniforms.viewMatrix.copy(camera.transform.matrixWorld);

            if (webgl.lastShader !== glShader) {
                gl.useProgram(glShader.program);
                webgl.lastShader = glShader;
            }
            if (webgl.lastBuffer !== glBuffer) {
                this.bindBuffers(glShader, glBuffer);
                webgl.lastBuffer = glBuffer;
            }

            texture = materialUniforms[sprite.texture];
            if (!texture) {
                Log.once("WebGLRenderer.renderSprite: sprite.texture " + sprite.texture + " was not found in material uniforms");
                return
            }

            this.bindShader(glShader, material, true);

            if (uniforms.crop) {
                w = texture.invWidth;
                h = texture.invHeight;

                gl.uniform4f(uniforms.crop.location, sprite.x * w, sprite.y * h, sprite.w * w, sprite.h * h);
            } else {
                Log.once("WebGLRenderer.renderSprite: sprite material shader needs a vec4 crop uniform");
                return;
            }
            if (uniforms.size) {
                gl.uniform2f(uniforms.size.location, sprite.width, sprite.height);
            } else {
                Log.once("WebGLRenderer.renderSprite: sprite material shader needs a vec2 size uniform");
                return;
            }

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, glBuffer.vertices);
        };


        var MAT = new Mat4;
        WebGLRenderer.prototype.renderMeshFilter = function(camera, transform, meshFilter) {
            var gl = this.context,
                webgl = this._webgl,

                mesh = meshFilter.mesh,
                material = meshFilter.material,
                wireframe = material.wireframe,
                glShader = wireframe ? webgl.shaders[ENUM_WIREFRAME_SHADER] : this.buildShader(mesh, material.shader),
                glBuffer = this.buildBuffer(mesh, material),
                uniforms, materialUniforms;

            if (!glShader || !glBuffer) return;

            uniforms = glShader.uniforms;
            materialUniforms = material.uniforms;

            if (uniforms.mvpMatrix) materialUniforms.mvpMatrix.mmul(camera.projection, transform.modelView);
            if (uniforms.modelMatrix) materialUniforms.modelMatrix.copy(transform.matrixWorld);
            if (uniforms.modelViewMatrix) materialUniforms.modelViewMatrix.copy(transform.modelView);
            if (uniforms.projectionMatrix) materialUniforms.projectionMatrix.copy(camera.projection);
            if (uniforms.viewMatrix) materialUniforms.viewMatrix.copy(camera.transform.matrixWorld);

            if (webgl.lastShader !== glShader) {
                gl.useProgram(glShader.program);
                webgl.lastShader = glShader;
            }
            if (webgl.lastBuffer !== glBuffer) {
                this.bindBuffers(glShader, glBuffer);
                webgl.lastBuffer = glBuffer;
            }

            this.bindShader(glShader, material, false);

            if (glBuffer.index) {
                gl.drawElements(gl.TRIANGLES, glBuffer.indices, gl.UNSIGNED_SHORT, 0);
            } else {
                gl.drawArrays(gl.TRIANGLES, 0, glBuffer.vertices);
            }
        };


        WebGLRenderer.prototype.bindBuffers = function(glShader, glBuffer) {
            var gl = this.context,
                attributes = glShader.attributes,
                FLOAT = gl.FLOAT,
                ARRAY_BUFFER = gl.ARRAY_BUFFER;


            if (glBuffer.vertex && attributes.aVertexPosition > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.vertex);
                gl.enableVertexAttribArray(attributes.aVertexPosition);
                gl.vertexAttribPointer(attributes.aVertexPosition, 3, FLOAT, false, 0, 0);
            }

            if (glBuffer.barycentric && attributes.aBarycentric > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.barycentric);
                gl.enableVertexAttribArray(attributes.aBarycentric);
                gl.vertexAttribPointer(attributes.aBarycentric, 3, FLOAT, false, 0, 0);
            }

            if (glBuffer.normal && attributes.aVertexNormal > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.normal);
                gl.enableVertexAttribArray(attributes.aVertexNormal);
                gl.vertexAttribPointer(attributes.aVertexNormal, 3, FLOAT, false, 0, 0);
            }

            if (glBuffer.tangent && attributes.aVertexTangent > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.tangent);
                gl.enableVertexAttribArray(attributes.aVertexTangent);
                gl.vertexAttribPointer(attributes.aVertexTangent, 4, FLOAT, false, 0, 0);
            }

            if (glBuffer.color && attributes.aVertexColor > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.color);
                gl.enableVertexAttribArray(attributes.aVertexColor);
                gl.vertexAttribPointer(attributes.aVertexColor, 3, FLOAT, false, 0, 0);
            }

            if (glBuffer.uv && attributes.aVertexUv > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.uv);
                gl.enableVertexAttribArray(attributes.aVertexUv);
                gl.vertexAttribPointer(attributes.aVertexUv, 2, FLOAT, false, 0, 0);
            }

            if (glBuffer.boneWeight && attributes.aBoneWeight > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.boneWeight);
                gl.enableVertexAttribArray(attributes.aBoneWeight);
                gl.vertexAttribPointer(attributes.aBoneWeight, 1, FLOAT, false, 0, 0);
            }

            if (glBuffer.boneIndex && attributes.aBoneIndex > -1) {
                gl.bindBuffer(ARRAY_BUFFER, glBuffer.boneIndex);
                gl.enableVertexAttribArray(attributes.aBoneIndex);
                gl.vertexAttribPointer(attributes.aBoneIndex, 1, FLOAT, false, 0, 0);
            }

            if (glBuffer.index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer.index);
        };


        WebGLRenderer.prototype.bindShader = function(glShader, material, ignoreMissing) {
            var gl = this.context,
                webgl = this._webgl,
                uniforms = glShader.uniforms,
                uniformValue, value, key,
                materialUniforms = material.uniforms,
                glTexture, index = 0,
                i;

            for (key in uniforms) {
                uniformValue = uniforms[key];
                value = materialUniforms[key];

                if (!value) {
                    if (ignoreMissing) continue;
                    if (uniformValue.type !== "sampler2D") throw new Error("WebGLRenderer.bindShader: material doesn't have " + key + " uniform that bound shader needs");
                }

                if (uniformValue.isArray) {
                    for (i = uniformValue.location.length; i--;) {
                        index = this.bindUniform(gl, webgl, uniformValue.type, uniformValue.location[i], value[i], index);
                    }
                } else {
                    index = this.bindUniform(gl, webgl, uniformValue.type, uniformValue.location, value, index);
                }
            }
        };


        WebGLRenderer.prototype.bindUniform = function(gl, webgl, type, location, value, index) {

            switch (type) {
                case "int":
                    gl.uniform1i(location, value);
                    break;
                case "float":
                    gl.uniform1f(location, value);
                    break;

                case "vec2":
                    gl.uniform2f(location, value.x, value.y);
                    break;
                case "vec3":
                    gl.uniform3f(location, value.x, value.y, value.z);
                    break;
                case "vec4":
                    gl.uniform4f(location, value.x, value.y, value.z, value.w);
                    break;

                case "mat2":
                    gl.uniformMatrix2fv(location, false, value.elements);
                    break;
                case "mat3":
                    gl.uniformMatrix3fv(location, false, value.elements);
                    break;
                case "mat4":
                    gl.uniformMatrix4fv(location, false, value.elements);
                    break;

                case "sampler2D":
                    index = this.bindTexture(gl, webgl, value, location, index);
            }

            return index;
        };


        WebGLRenderer.prototype.bindTexture = function(gl, webgl, texture, uniform, index) {
            var glTexture = this.buildTexture(texture);

            if (webgl.lastTexture !== glTexture) {
                gl.activeTexture(gl.TEXTURE0 + index);
                gl.bindTexture(gl.TEXTURE_2D, glTexture);
                gl.uniform1i(uniform, index);

                webgl.lastTexture = glTexture;
            }

            return ++index;
        };


        var COMPILE_ARRAY = [];

        WebGLRenderer.prototype.buildBuffer = function(mesh, material) {
            if (!mesh) return undefined;

            var webgl = this._webgl,
                buffers = webgl.buffers,
                glBuffers = buffers[mesh._id];

            if (glBuffers && !mesh.needsUpdate) return glBuffers;

            var gl = this.context,
                compileArray = COMPILE_ARRAY,
                DRAW = mesh.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
                ARRAY_BUFFER = gl.ARRAY_BUFFER,
                ELEMENT_ARRAY_BUFFER = gl.ELEMENT_ARRAY_BUFFER,
                items, item,
                i, il;

            glBuffers = glBuffers || (buffers[mesh._id] = {});

            items = mesh.vertices || EMPTY_ARRAY;
            if (items.length) {

                compileArray.length = 0;
                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.x, item.y, item.z);
                }

                if (compileArray.length) {
                    glBuffers.vertex = glBuffers.vertex || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffers.vertex);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
                glBuffers.vertices = items.length;

                if (material && material.wireframe) {

                    compileArray.length = 0;
                    for (i = 0, il = items.length; i < il; i += 3) {
                        compileArray.push(1, 0, 0);
                        compileArray.push(0, 1, 0);
                        compileArray.push(0, 0, 1);
                    }

                    glBuffers.barycentric = glBuffers.barycentric || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffers.barycentric);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
            }

            items = mesh.normals || EMPTY_ARRAY;
            if (items.length) {

                compileArray.length = 0;
                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.x, item.y, item.z);
                }

                if (compileArray.length) {
                    glBuffers.normal = glBuffers.normal || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffers.normal);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
            }

            items = mesh.tangents || EMPTY_ARRAY;
            if (items.length) {

                compileArray.length = 0;
                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.x, item.y, item.z, item.w);
                }

                if (compileArray.length) {
                    glBuffers.tangent = glBuffers.tangent || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffers.tangent);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
            }

            items = mesh.colors || EMPTY_ARRAY;
            if (items.length) {

                compileArray.length = 0;
                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.r, item.g, item.b);
                }

                if (compileArray.length) {
                    glBuffers.color = glBuffers.color || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffers.color);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
            }

            items = mesh.uvs || EMPTY_ARRAY;
            if (items.length) {

                compileArray.length = 0;
                for (i = 0, il = items.length; i < il; i++) {
                    item = items[i];
                    compileArray.push(item.x, item.y);
                }

                if (compileArray.length) {
                    glBuffers.uv = glBuffers.uv || gl.createBuffer();
                    gl.bindBuffer(ARRAY_BUFFER, glBuffers.uv);
                    gl.bufferData(ARRAY_BUFFER, new Float32Array(compileArray), DRAW);
                }
            }

            items = mesh.boneIndices || EMPTY_ARRAY;
            if (items.length) {

                glBuffers.boneIndex = glBuffers.boneIndex || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, glBuffers.boneIndex);
                gl.bufferData(ARRAY_BUFFER, new Float32Array(items), DRAW);
            }

            items = mesh.boneWeights || EMPTY_ARRAY;
            if (items.length) {

                glBuffers.boneWeight = glBuffers.boneWeight || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, glBuffers.boneWeight);
                gl.bufferData(ARRAY_BUFFER, new Float32Array(items), DRAW);
            }

            items = mesh.indices || mesh.faces || EMPTY_ARRAY;
            if (items && items.length) {
                glBuffers.index = glBuffers.index || gl.createBuffer();
                gl.bindBuffer(ELEMENT_ARRAY_BUFFER, glBuffers.index);
                gl.bufferData(ELEMENT_ARRAY_BUFFER, new Int16Array(items), DRAW);

                glBuffers.indices = items.length;
            }

            mesh.needsUpdate = false;

            return glBuffers;
        };

        WebGLRenderer.prototype.buildShader = function(mesh, shader) {
            var webgl = this._webgl,
                shaders = webgl.shaders,
                glShader = shaders[shader._id];

            if (glShader && !shader.needsUpdate) return glShader;

            var gl = this.context,
                gpu = webgl.gpu,
                ext = webgl.ext,
                precision = gpu.precision,
                standardDerivatives = ext.standardDerivatives ? "#extension GL_OES_standard_derivatives : enable\n" : "",
                precisionFloat = "precision " + precision + " float;\n",
                precisionInt = "precision " + precision + " int;\n",
                vertexShader = precisionFloat + precisionInt + shader.vertex,
                fragmentShader = precisionFloat + precisionInt + standardDerivatives + shader.fragment,
                program;

            glShader = glShader || (shaders[shader._id] = {});

            program = glShader.program = createProgram(gl, vertexShader, fragmentShader);

            parseUniformsAttributes(gl, program, vertexShader, fragmentShader,
                glShader.attributes || (glShader.attributes = {}),
                glShader.uniforms || (glShader.uniforms = {})
            );

            shader.needsUpdate = false;

            return glShader;
        };


        WebGLRenderer.prototype.buildTexture = function(texture) {
            if (!texture || !texture.raw) return this._webgl.textures[ENUM_WHITE_TEXTURE];

            var webgl = this._webgl,
                textures = webgl.textures,
                glTexture = textures[texture._id];

            if (glTexture && !texture.needsUpdate) return glTexture;

            var gl = this.context,
                raw = texture.raw,
                ext = webgl.ext,
                gpu = webgl.gpu,
                TFA = ext.textureFilterAnisotropic,

                isPOT = isPowerOfTwo(raw.width) && isPowerOfTwo(raw.height),
                anisotropy = clamp(texture.anisotropy, 1, gpu.maxAnisotropy),

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

            glTexture = glTexture || (textures[texture._id] = gl.createTexture());
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
        };


        WebGLRenderer.prototype._handleWebGLContextLost = function(e) {
            e.preventDefault();
            Log.warn("WebGLRenderer: webgl context was lost");

            this._context = false;
            this.emit("webglcontextlost", e);
        };


        WebGLRenderer.prototype._handleWebGLContextRestored = function(e) {
            Log.log("WebGLRenderer: webgl context was restored");

            this.setDefaults();

            this._context = true;
            this.emit("webglcontextrestored", e);
        };


        var wireframe = {
            vertex: [
                "uniform mat4 mvpMatrix;",

                "attribute vec3 aVertexPosition;",
                "attribute vec3 aBarycentric;",

                "varying vec3 vBarycentric;",

                "void main() {",
                "	vBarycentric = aBarycentric;",
                "	gl_Position = mvpMatrix * vec4(aVertexPosition, 1.0);",
                "}"
            ].join("\n"),

            fragment: [
                "uniform vec3 diffuseColor;",

                "varying vec3 vBarycentric;",

                "float edgeFactor(){",
                "	vec3 d = fwidth(vBarycentric);",
                "	vec3 a3 = smoothstep(vec3(0.0), d*1.5, vBarycentric);",
                "	return min(min(a3.x, a3.y), a3.z);",
                "}",

                "void main() {",
                "	gl_FragColor = vec4(diffuseColor, (1.0 - edgeFactor()) * 0.95);",
                "}"
            ].join("\n")
        };


        return WebGLRenderer;
    }
);
