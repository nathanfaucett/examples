if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/event_emitter",
        "odin/base/device",
        "odin/base/dom",
        "odin/base/util",
        "odin/math/mathf",
        "odin/math/color",
        "odin/math/vec2",
        "odin/math/vec4",
        "odin/math/mat4",
        "odin/core/enums",
        "odin/core/game/log",
        "odin/core/renderer/canvas"
    ],
    function(EventEmitter, Device, Dom, util, Mathf, Color, Vec2, Vec4, Mat4, Enums, Log, Canvas) {
        "use strict";


        var Blending = Enums.Blending,
            ShadowMapType = Enums.ShadowMapType,
            CullFace = Enums.CullFace,
            Side = Enums.Side,

            LightType = Enums.LightType,
            Shading = Enums.Shading,

            FilterMode = Enums.FilterMode,
            TextureFormat = Enums.TextureFormat,
            TextureWrap = Enums.TextureWrap,

            getWebGLContext = Dom.getWebGLContext,
            addEvent = Dom.addEvent,
            removeEvent = Dom.removeEvent,

            createProgram = Dom.createProgram,
            parseUniformsAttributes = Dom.parseUniformsAttributes,
            getUniformsAttributes = Dom.getUniformsAttributes,

            merge = util.merge,
            copy = util.copy,

            max = Math.max,
            floor = Math.floor,
            clamp = Mathf.clamp,
            isPowerOfTwo = Mathf.isPowerOfTwo,

            defineProperty = Object.defineProperty;


        function Renderer(opts) {
            opts || (opts = {});

            EventEmitter.call(this);

            var _this = this,
                _projScreenMatrix = new Mat4,
                _mat4 = new Mat4,
                _gl,
                _extensions,
                _canvas,
                _element,
                _context = false;


            this.attributes = merge(opts.attributes || {}, {
                alpha: true,
                antialias: true,
                depth: false,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                stencil: true
            });

            this.autoClear = opts.autoClear != undefined ? opts.autoClear : true;
            this.autoClearColor = opts.autoClearColor != undefined ? opts.autoClearColor : true;
            this.autoClearDepth = opts.autoClearDepth != undefined ? opts.autoClearDepth : false;
            this.autoClearStencil = opts.autoClearStencil != undefined ? opts.autoClearStencil : true;


            var _spriteShader, _spriteBuffers;

            this.init = function(canvas) {
                if (_canvas) this.clear();

                _canvas = canvas;
                _element = canvas.element;

                initGL();
                _context = true;
                setDefaultGLState();

                addEvent(_element, "webglcontextlost", handleWebGLContextLost, this);
                addEvent(_element, "webglcontextrestored", handleWebGLContextRestored, this);

                _spriteBuffers = {};
                createBuffer(_spriteBuffers, "vertexBuffer", new Float32Array([-0.5, 0.5, -0.5, -0.5,
                    0.5, 0.5,
                    0.5, -0.5
                ]));
                createBuffer(_spriteBuffers, "uvBuffer", new Float32Array([
                    0, 0,
                    0, 1,
                    1, 0,
                    1, 1
                ]));
                _spriteBuffers.vertexCount = 4;
                _spriteShader = new Shader(sprite_vertex, sprite_fragment);

                return this;
            };


            this.clear = function() {
                if (!_canvas) return this;

                removeEvent(element, "webglcontextlost", handleWebGLContextLost, this);
                removeEvent(element, "webglcontextrestored", handleWebGLContextRestored, this);

                _gl = undefined
                _canvas = undefined;
                _element = undefined;
                _context = false;

                _extensions = undefined;

                _spriteBuffers = undefined;
                _spriteShader = undefined;

                _precision = "highp";
                _maxAnisotropy = 0;
                _maxTextures = 0;
                _maxVertexTextures = 0;
                _maxTextureSize = 0;
                _maxCubeTextureSize = 0;
                _maxRenderBufferSize = 0;

                _maxUniforms = 0;
                _maxVaryings = 0;
                _maxAttributes = 0;

                _lastCamera = undefined;
                _lastResizeFn = undefined;
                _lastScene = undefined;

                _viewportX = 0;
                _viewportY = 0;
                _viewportWidth = 1;
                _viewportHeight = 1;

                _lastBlending = -1;
                _lastClearColor.set(0, 0, 0);
                _lastCullFace = -1;
                _lastDepthTest = -1;
                _lastDepthWrite = -1;
                _lastLineWidth = -1;

                _lastBuffer = undefined,
                _lastShader = undefined;

                return this;
            };


            defineProperty(this, "gl", {
                get: function() {
                    return _gl;
                }
            });
            defineProperty(this, "canvas", {
                get: function() {
                    return _canvas;
                }
            });
            defineProperty(this, "element", {
                get: function() {
                    return _element;
                }
            });
            defineProperty(this, "precision", {
                get: function() {
                    return _precision;
                }
            });
            defineProperty(this, "maxAnisotropy", {
                get: function() {
                    return _maxAnisotropy;
                }
            });
            defineProperty(this, "maxTextures", {
                get: function() {
                    return _maxTextures;
                }
            });
            defineProperty(this, "maxVertexTextures", {
                get: function() {
                    return _maxVertexTextures;
                }
            });
            defineProperty(this, "maxTextureSize", {
                get: function() {
                    return _maxTextureSize;
                }
            });
            defineProperty(this, "maxCubeTextureSize", {
                get: function() {
                    return _maxCubeTextureSize;
                }
            });
            defineProperty(this, "maxRenderBufferSize", {
                get: function() {
                    return _maxRenderBufferSize;
                }
            });
            defineProperty(this, "maxUniforms", {
                get: function() {
                    return _maxUniforms;
                }
            });
            defineProperty(this, "maxVaryings", {
                get: function() {
                    return _maxVaryings;
                }
            });
            defineProperty(this, "maxAttributes", {
                get: function() {
                    return _maxAttributes;
                }
            });


            var _viewportX = 0,
                _viewportY = 0,
                _viewportWidth = 1,
                _viewportHeight = 1;

            function setViewport(x, y, width, height) {
                x || (x = 0);
                y || (y = 0);
                width || (width = _canvas.pixelWidth);
                height || (height = _canvas.pixelHeight);

                if (_viewportX !== x || _viewportY !== y || _viewportWidth !== width || _viewportHeight !== height) {
                    _viewportX = x;
                    _viewportY = y;
                    _viewportWidth = width;
                    _viewportHeight = height;

                    _gl.viewport(x, y, width, height);
                }
            }
            this.setViewport = setViewport;


            var _lastDepthTest = -1;

            function setDepthTest(depthTest) {

                if (_lastDepthTest !== depthTest) {

                    if (depthTest) {
                        _gl.enable(_gl.DEPTH_TEST);
                    } else {
                        _gl.disable(_gl.DEPTH_TEST);
                    }

                    _lastDepthTest = depthTest;
                }
            }
            this.setDepthTest = setDepthTest;


            var _lastDepthWrite = -1;

            function setDepthWrite(depthWrite) {

                if (_lastDepthWrite !== depthWrite) {

                    _gl.depthMask(depthWrite);
                    _lastDepthWrite = depthWrite;
                }
            }
            this.setDepthWrite = setDepthWrite;


            var _lastLineWidth = 1;

            function setLineWidth(width) {

                if (_lastLineWidth !== width) {

                    _gl.lineWidth(width);
                    _lastLineWidth = width;
                }
            }
            this.setLineWidth = setLineWidth;


            var _lastCullFace = -1,
                _cullFaceDisabled = true;

            function setCullFace(cullFace) {

                if (_lastCullFace !== cullFace) {
                    if (!_lastCullFace || _lastCullFace === CullFace.None) _cullFaceDisabled = true;

                    if (cullFace === CullFace.Front) {
                        if (_cullFaceDisabled) _gl.enable(_gl.CULL_FACE);
                        _gl.cullFace(_gl.FRONT);
                    } else if (cullFace === CullFace.Back) {
                        if (_cullFaceDisabled) _gl.enable(_gl.CULL_FACE);
                        _gl.cullFace(_gl.BACK);
                    } else if (cullFace === CullFace.FrontBack) {
                        if (_cullFaceDisabled) _gl.enable(_gl.CULL_FACE);
                        _gl.cullFace(_gl.FRONT_AND_BACK);
                    } else {
                        _gl.disable(_gl.CULL_FACE);
                        _lastCullFace = CullFace.None;
                        return;
                    }

                    _lastCullFace = cullFace;
                }
            }
            this.setCullFace = setCullFace;


            var _lastBlending = -1;

            function setBlending(blending) {

                if (blending !== _lastBlending) {

                    if (blending === Blending.None) {
                        _gl.disable(_gl.BLEND);
                    } else if (blending === Blending.Additive) {
                        _gl.enable(_gl.BLEND);
                        _gl.blendEquation(_gl.FUNC_ADD);
                        _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE);
                    } else if (blending === Blending.Subtractive) {
                        _gl.enable(_gl.BLEND);
                        _gl.blendEquation(_gl.FUNC_ADD);
                        _gl.blendFunc(_gl.ZERO, _gl.ONE_MINUS_SRC_COLOR);
                    } else if (blending === Blending.Muliply) {
                        _gl.enable(_gl.BLEND);
                        _gl.blendEquation(_gl.FUNC_ADD);
                        _gl.blendFunc(_gl.ZERO, _gl.SRC_COLOR);
                    } else if (blending === Blending.Default) {
                        _gl.enable(_gl.BLEND);
                        _gl.blendEquationSeparate(_gl.FUNC_ADD, _gl.FUNC_ADD);
                        _gl.blendFuncSeparate(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA, _gl.ONE, _gl.ONE_MINUS_SRC_ALPHA);
                        _lastBlending = Blending.Default;
                        return;
                    }

                    _lastBlending = blending;
                }
            }
            this.setBlending = setBlending;


            function setScissor(x, y, width, height) {

                _gl.scissor(x, y, width, height);
            };
            this.setScissor = setScissor;


            var _clearColor = new Color,
                _clearAlpha = 1;

            function setClearColor(color, alpha) {
                alpha || (alpha = 1);

                if (!_clearColor.equals(color) || alpha !== _clearAlpha) {

                    _clearColor.copy(color);
                    _clearAlpha = alpha;

                    this.context.clearColor(_clearColor.r, _clearColor.g, _clearColor.b, _clearAlpha);
                }
            }
            this.setClearColor = setClearColor;


            function clearCanvas(color, depth, stencil) {
                var bits = 0;

                if (color === undefined || color) bits |= _gl.COLOR_BUFFER_BIT;
                if (depth === undefined || depth) bits |= _gl.DEPTH_BUFFER_BIT;
                if (stencil === undefined || stencil) bits |= _gl.STENCIL_BUFFER_BIT;

                _gl.clear(bits);
            }
            this.clearCanvas = clearCanvas;


            function clearColor() {

                _gl.clear(_gl.COLOR_BUFFER_BIT);
            }
            this.clearColor = clearColor;


            function clearDepth() {

                _gl.clear(_gl.DEPTH_BUFFER_BIT);
            }
            this.clearDepth = clearDepth;


            function clearStencil() {

                _gl.clear(_gl.STENCIL_BUFFER_BIT);
            }
            this.clearStencil = clearStencil;


            var _textureIndex = 0,
                _lastTexture = undefined;

            function setTexture(location, texture, key) {
                if (!texture || !texture.raw) return;
                var index, glTexture;

                if (_textureIndex >= _maxTextures) Log.warn("Renderer setTexure: using " + _textureIndex + " texture units, GPU only supports " + _maxTextures);

                if (!texture.needsUpdate && (glTexture = texture._webgl)) {
                    index = _textureIndex++;

                    _gl.activeTexture(_gl.TEXTURE0 + index);
                    _gl.bindTexture(_gl.TEXTURE_2D, glTexture);
                    _gl.uniform1i(location, index);

                    return;
                }

                glTexture = texture._webgl || (texture._webgl = _gl.createTexture());
                index = _textureIndex++;

                var raw = texture.raw,
                    TFA = _extensions.EXT_texture_filter_anisotropic,

                    isPOT = isPowerOfTwo(raw.width) && isPowerOfTwo(raw.height),
                    anisotropy = clamp(texture.anisotropy || 1, 1, _maxAnisotropy),

                    TEXTURE_2D = _gl.TEXTURE_2D,
                    mipmap = texture.mipmap,
                    filter = texture.filter,
                    format = texture.format,
                    wrap = texture.wrap,
                    WRAP, MAG_FILTER, MIN_FILTER, FORMAT;

                if (filter === FilterMode.None) {
                    MAG_FILTER = _gl.NEAREST;
                    if (mipmap && isPOT) {
                        MIN_FILTER = _gl.LINEAR_MIPMAP_NEAREST;
                    } else {
                        MIN_FILTER = _gl.NEAREST;
                    }
                } else { //FilterMode.Linear
                    MAG_FILTER = _gl.LINEAR;
                    if (mipmap && isPOT) {
                        MIN_FILTER = _gl.LINEAR_MIPMAP_LINEAR;
                    } else {
                        MIN_FILTER = _gl.LINEAR;
                    }
                }

                if (format === TextureFormat.RGB) {
                    FORMAT = _gl.RGB;
                } else if (format === TextureFormat.RGBA) {
                    FORMAT = _gl.RGBA;
                } else if (format === TextureFormat.LuminanceAlpha) {
                    FORMAT = _gl.LUMINANCE_ALPHA;
                } else if (format === TextureFormat.Luminance) {
                    FORMAT = _gl.LUMINANCE;
                } else if (format === TextureFormat.Alpha) {
                    FORMAT = _gl.ALPHA;
                }

                if (wrap === TextureWrap.Clamp) {
                    WRAP = _gl.CLAMP_TO_EDGE;
                } else if (wrap === TextureWrap.MirrorRepeat) {
                    WRAP = isPOT ? _gl.MIRRORED_REPEAT : _gl.CLAMP_TO_EDGE;
                } else { //TextureWrap.Repeat
                    WRAP = isPOT ? _gl.REPEAT : _gl.CLAMP_TO_EDGE;
                }

                _gl.activeTexture(_gl.TEXTURE0 + index);
                _gl.bindTexture(TEXTURE_2D, glTexture);
                _gl.uniform1i(location, index);

                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, texture.flipY ? 0 : 1);
                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha ? 1 : 0);

                _gl.texImage2D(TEXTURE_2D, 0, FORMAT, FORMAT, _gl.UNSIGNED_BYTE, clampToMaxSize(raw, _maxTextureSize));

                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, MAG_FILTER);
                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, MIN_FILTER);

                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_WRAP_S, WRAP);
                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_WRAP_T, WRAP);

                if (TFA) _gl.texParameterf(TEXTURE_2D, TFA.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
                if (mipmap && isPOT) _gl.generateMipmap(TEXTURE_2D);

                texture.needsUpdate = false;
            }


            function clampToMaxSize(image, maxSize) {
                if (image.height <= maxSize && image.width <= maxSize) return image;
                var maxDim = 1 / max(image.width, image.height),
                    newWidth = floor(image.width * maxSize * maxDim),
                    newHeight = floor(image.height * maxSize * maxDim),
                    canvas = document.createElement("canvas"),
                    ctx = canvas.getContext("2d");

                canvas.width = newWidth;
                canvas.height = newHeight;
                ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, newWidth, newHeight);

                Log.once("Renderer clampToMaxSize: image height larger than machines max cube texture size (max = " + maxSize + ")");

                return canvas;
            }


            function createBuffer(obj, name, array) {

                obj[name] = obj[name] || _gl.createBuffer();
                _gl.bindBuffer(_gl.ARRAY_BUFFER, obj[name]);
                _gl.bufferData(_gl.ARRAY_BUFFER, array, _gl.STATIC_DRAW);
            }


            var _lastBuffer = undefined,
                _lastShader = undefined;

            function bindBuffers(buffers, attributes) {
                if (_lastBuffer === buffers) return;
                var ARRAY_BUFFER = _gl.ARRAY_BUFFER,
                    FLOAT = _gl.FLOAT;

                _gl.bindBuffer(ARRAY_BUFFER, buffers.vertexBuffer);
                _gl.enableVertexAttribArray(attributes.position);
                _gl.vertexAttribPointer(attributes.position, 2, FLOAT, false, 0, 0);

                _gl.bindBuffer(ARRAY_BUFFER, buffers.uvBuffer);
                _gl.enableVertexAttribArray(attributes.uv);
                _gl.vertexAttribPointer(attributes.uv, 2, FLOAT, false, 0, 0);

                _lastBuffer = buffers;
            }


            var _lastCamera = undefined,
                _lastResizeFn = undefined,
                _lastScene = undefined;
            this.preRender = function(gui, scene, camera) {
                if (!_context) return;
                var background = camera.background;

                if (_clearColor.r !== background.r || _clearColor.g !== background.g || _clearColor.b !== background.b) {
                    _clearColor.copy(background);
                    _gl.clearColor(background.r, background.g, background.b, 1);
                    if (!this.autoClear) clearCanvas(true, this.autoClearDepth, this.autoClearStencil);
                }
                if (_lastCamera !== camera) {
                    var w = _canvas.pixelWidth,
                        h = _canvas.pixelHeight;

                    camera.set(w, h);
                    this.setViewport(0, 0, w, h);

                    if (_lastResizeFn) _canvas.off("resize", _lastResizeFn);

                    _lastResizeFn = function() {
                        var w = this.pixelWidth,
                            h = this.pixelHeight;

                        camera.set(w, h);
                        _this.setViewport(0, 0, w, h);
                        _projScreenMatrix.mmul(camera.projection, camera.view);
                    };

                    _canvas.on("resize", _lastResizeFn);
                    _lastCamera = camera;
                    _projScreenMatrix.mmul(camera.projection, camera.view);
                }
                if (scene && _lastScene !== scene) {

                    _lastScene = scene;
                }

                if (this.autoClear) clearCanvas(this.autoClearColor, this.autoClearDepth, this.autoClearStencil);
            };


            this.renderGUI = function(gui, camera) {
                if (!_context) return;
                var components = gui.components,
                    transform,
                    i;

            };


            var EMPTY_ARRAY = [];
            /**
             * @method render
             * @memberof Renderer
             * @brief renderers scene from camera's perspective
             * @param Scene scene
             * @param Camera camera
             */
            this.render = function(scene, camera) {
                if (!_context) return;
                var lineWidth = _lastLineWidth,
                    blending = _lastBlending,
                    cullFace = _lastCullFace,

                    components = scene.components,
                    sprites = components.Sprite || EMPTY_ARRAY,
                    particleSystems = components.ParticleSystem || EMPTY_ARRAY,
                    sprite2d, particleSystem, transform2d,
                    i;

                for (i = sprites.length; i--;) {
                    sprite2d = sprites[i];
                    transform2d = sprite2d.transform2d;

                    if (!transform2d || !sprite2d.visible) continue;

                    transform2d.updateModelViewMat32(camera.view);
                    renderSprite(camera, transform2d, sprite2d);
                }

                setCullFace(cullFace);
                setBlending(blending);
                setLineWidth(lineWidth);
            };

            var VEC2 = new Vec2,
                VEC4 = new Vec4,
                MAT4 = new Mat4;

            function renderSprite(camera, transform2d, sprite2d) {
                var texture = sprite2d.texture,
                    uniforms = _spriteShader.uniforms,
                    force = false,
                    w, h;

                if (texture && texture.raw) {
                    w = texture.invWidth;
                    h = texture.invHeight;
                } else {
                    return;
                }

                MAT4.mmul(camera._projectionMat4, MAT4.fromMat32(transform2d.modelView));

                if (_lastShader !== _spriteShader) {
                    _gl.useProgram(_spriteShader.program);
                    force = true;
                    _lastShader = _spriteShader;
                }
                bindBuffers(_spriteBuffers, _spriteShader.attributes);

                uniforms.matrix.bind(MAT4);
                uniforms.crop.bind(VEC4.set(sprite2d.x * w, sprite2d.y * h, sprite2d.w * w, sprite2d.h * h));
                uniforms.size.bind(VEC2.set(sprite2d.width, sprite2d.height));
                uniforms.alpha.bind(sprite2d.alpha);
                uniforms.texture.bind(texture);

                _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, _spriteBuffers.vertexCount);
                _textureIndex = 0;
            };


            function initGL() {
                try {
                    _gl = getWebGLContext(_element, _this.attributes);
                    if (_gl === null) throw "Error creating WebGL context";
                } catch (e) {
                    Log.error(e);
                }

                if (_gl.getShaderPrecisionFormat == undefined) {
                    _gl.getShaderPrecisionFormat = function() {
                        return {
                            rangeMin: 1,
                            rangeMax: 1,
                            precision: 1
                        };
                    }
                }

                getExtensions();
                getGPUInfo();
            }


            function setDefaultGLState() {

                _gl.clearColor(0, 0, 0, 1);
                _gl.clearDepth(1);
                _gl.clearStencil(0);

                setDepthTest(true);
                _gl.depthFunc(_gl.LEQUAL);

                _gl.frontFace(_gl.CCW);

                setCullFace(CullFace.Back);
                setBlending(Blending.Default);

                setViewport();
            }


            function handleWebGLContextLost(e) {
                e.preventDefault();
                Log.warn("Renderer: webgl context was lost");

                _context = false;
                this.emit("webglcontextlost", e);
            }


            function handleWebGLContextRestored(e) {
                Log.log("Renderer: webgl context was restored");

                initGL();
                setDefaultGLState();

                _context = true;
                this.emit("webglcontextrestored", e);
            }


            var _precision = "highp",
                _maxAnisotropy = 0,
                _maxTextures = 0,
                _maxVertexTextures = 0,
                _maxTextureSize = 0,
                _maxCubeTextureSize = 0,
                _maxRenderBufferSize = 0,

                _maxUniforms = 0,
                _maxVaryings = 0,
                _maxAttributes = 0;

            function getGPUInfo() {
                var VERTEX_SHADER = _gl.VERTEX_SHADER,
                    FRAGMENT_SHADER = _gl.FRAGMENT_SHADER,
                    HIGH_FLOAT = _gl.HIGH_FLOAT,
                    MEDIUM_FLOAT = _gl.MEDIUM_FLOAT,

                    EXT_texture_filter_anisotropic = _extensions.EXT_texture_filter_anisotropic,

                    vsHighpFloat = _gl.getShaderPrecisionFormat(VERTEX_SHADER, HIGH_FLOAT),
                    vsMediumpFloat = _gl.getShaderPrecisionFormat(VERTEX_SHADER, MEDIUM_FLOAT),

                    fsHighpFloat = _gl.getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT),
                    fsMediumpFloat = _gl.getShaderPrecisionFormat(FRAGMENT_SHADER, MEDIUM_FLOAT),

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

                _precision = precision;
                _maxAnisotropy = EXT_texture_filter_anisotropic ? _gl.getParameter(EXT_texture_filter_anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
                _maxTextures = _gl.getParameter(_gl.MAX_TEXTURE_IMAGE_UNITS);
                _maxVertexTextures = _gl.getParameter(_gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
                _maxTextureSize = _gl.getParameter(_gl.MAX_TEXTURE_SIZE);
                _maxCubeTextureSize = _gl.getParameter(_gl.MAX_CUBE_MAP_TEXTURE_SIZE);
                _maxRenderBufferSize = _gl.getParameter(_gl.MAX_RENDERBUFFER_SIZE);

                _maxUniforms = max(_gl.getParameter(_gl.MAX_FRAGMENT_UNIFORM_VECTORS), _gl.getParameter(_gl.MAX_VERTEX_UNIFORM_VECTORS)) * 4;
                _maxVaryings = _gl.getParameter(_gl.MAX_VARYING_VECTORS) * 4;
                _maxAttributes = _gl.getParameter(_gl.MAX_VERTEX_ATTRIBS);
            }


            function getExtensions() {
                _extensions = {};

                getExtension("EXT_texture_filter_anisotropic");

                getExtension("WEBGL_compressed_texture_s3tc");
                _extensions.WEBGL_compressed_texture_s3tc_formats = _extensions.WEBGL_compressed_texture_s3tc ? _gl.getParameter(_gl.COMPRESSED_TEXTURE_FORMATS) : null;

                getExtension("OES_standard_derivatives");

                getExtension("OES_texture_float");
                getExtension("OES_texture_float_linear");
            }


            var getExtension_prefixes = ["WEBKIT", "MOZ", "O", "MS", "webkit", "moz", "o", "ms"],
                getExtension_length = getExtension_prefixes.length;

            function getExtension(name) {
                var extension = _extensions[name] || (_extensions[name] = _gl.getExtension(name));

                if (extension == undefined) {
                    var i = getExtension_length;

                    while (i--) {
                        if ((extension = _gl.getExtension(getExtension_prefixes[i] + "_" + name))) return (_extensions[name] = extension);
                    }
                }

                return extension;
            }
            this.getExtension = getExtension;


            var HEADER = /([\s\S]*)?(void[\s]+main)/,
                MAIN_FUNCTION = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{([^}]*)}/,
                MAIN_SPLITER = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{/;

            function Shader(vertex, fragment) {

                this.vertex = vertex;
                this.fragment = fragment;

                this.program = undefined;
                this.attributes = undefined;
                this.uniforms = undefined;

                buildShader(this);
            }

            function buildShader(shader) {
                var precision = "precision " + _precision + " float;\nprecision " + _precision + " int;\n",

                    glVertexShader = precision + shader.vertex,
                    glFragmentShader = precision + shader.fragment;

                shader.program = createProgram(_gl, glVertexShader, glFragmentShader);
                parseUniformsAttributes(shader.program, glVertexShader, glFragmentShader, (shader.attributes = {}), (shader.uniforms = {}));
            };


            var SHADER_SPLITER = /[\n;]+/,
                ATTRIBURE = /attribute\s+([a-z]+\s+)?([A-Za-z0-9]+)\s+([a-zA-Z_0-9]+)\s*(\[\s*(.+)\s*\])?/,
                UNIFORM = /uniform\s+([a-z]+\s+)?([A-Za-z0-9]+)\s+([a-zA-Z_0-9]+)\s*(\[\s*(.+)\s*\])?/,
                DEFINE = /#define\s+([a-zA-Z_0-9]+)?\s+([0-9]+)?/;

            function parseUniformsAttributesCustom(vertexShader, fragmentShader, attributes, uniforms) {
                var src = vertexShader + fragmentShader,
                    lines = src.split(SHADER_SPLITER),
                    matchAttributes, matchUniforms,
                    name, length, line,
                    i, j;

                for (i = lines.length; i--;) {
                    line = lines[i];
                    matchAttributes = line.match(ATTRIBURE);
                    matchUniforms = line.match(UNIFORM);

                    if (matchAttributes) {
                        attributes.push({
                            type: matchAttributes[2],
                            name: matchAttributes[3]
                        });
                    } else if (matchUniforms) {
                        uniforms.push({
                            type: matchUniforms[2],
                            name: matchUniforms[3]
                        });
                    }
                }
            }

            function parseUniformsAttributes(program, vertexShader, fragmentShader, attributes, uniforms) {
                var src = vertexShader + fragmentShader,
                    lines = src.split(SHADER_SPLITER),
                    defines = {}, matchAttributes, matchUniforms, matchDefines,
                    uniformArray, name, location, type, length, line,
                    i, j;

                for (i = lines.length; i--;) {
                    matchDefines = lines[i].match(DEFINE);
                    if (matchDefines) defines[matchDefines[1]] = Number(matchDefines[2]);
                }

                for (i = lines.length; i--;) {
                    line = lines[i];
                    matchAttributes = line.match(ATTRIBURE);
                    matchUniforms = line.match(UNIFORM);

                    if (matchAttributes) {
                        name = matchAttributes[3];
                        attributes[name] = _gl.getAttribLocation(program, name);
                    } else if (matchUniforms) {
                        type = matchUniforms[2];
                        name = matchUniforms[3];
                        length = matchUniforms[5];

                        if (length) {
                            length = defines[length.trim()] || length;
                            uniformArray = uniforms[name] = [];
                            for (j = length; j--;) uniformArray[j] = createUniform(type, _gl.getUniformLocation(program, name + "[" + j + "]"));
                        } else {
                            uniforms[name] = createUniform(type, _gl.getUniformLocation(program, name));
                        }
                    }
                }
            }


            function createUniform(type, location) {

                if (type === "int") {
                    return new Uniform1i(location);
                } else if (type === "float") {
                    return new Uniform1f(location);
                } else if (type === "vec2") {
                    return new Uniform2f(location);
                } else if (type === "vec3") {
                    return new Uniform3f(location);
                } else if (type === "vec4") {
                    return new Uniform4f(location);
                } else if (type === "mat2") {
                    return new UniformMatrix2fv(location);
                } else if (type === "mat3") {
                    return new UniformMatrix3fv(location);
                } else if (type === "mat4") {
                    return new UniformMatrix4fv(location);
                } else if (type === "sampler2D") {
                    return new UniformTexture(location);
                } else if (type === "samplerCube") {
                    return new UniformTextureCube(location);
                }

                return null;
            }

            function Uniform1f(location) {
                this.location = location;
                this.value = undefined;
            }
            Uniform1f.prototype.bind = function(value) {
                if (this.value !== value) {
                    _gl.uniform1f(this.location, value);
                    this.value = value;
                }
            };

            function Uniform1i(location) {
                this.location = location;
                this.value = undefined;
            }
            Uniform1i.prototype.bind = function(value) {
                if (this.value !== value) {
                    _gl.uniform1i(this.location, value);
                    this.value = value;
                }
            };

            function Uniform2f(location) {
                this.location = location;
                this.value = new Vec2(NaN, NaN);
            }
            Uniform2f.prototype.bind = function(value) {
                if (this.value.notEquals(value)) {
                    _gl.uniform2f(this.location, value.x, value.y);
                    this.value.copy(value);
                }
            };

            function Uniform3f(location) {
                this.location = location;
                this.value = new Vec3(NaN, NaN, NaN);
            }
            Uniform3f.prototype.bind = function(value) {
                if (this.value.notEquals(value)) {
                    _gl.uniform3f(this.location, value.x, value.y, value.z);
                    this.value.copy(value);
                }
            };

            function Uniform4f(location) {
                this.location = location;
                this.value = new Vec4(NaN, NaN, NaN, NaN);
            }
            Uniform4f.prototype.bind = function(value) {
                if (this.value.notEquals(value)) {
                    _gl.uniform4f(this.location, value.x, value.y, value.z, value.w);
                    this.value.copy(value);
                }
            };

            function UniformMatrix2fv(location) {
                this.location = location;
                this.value = new Mat2(
                    NaN, NaN,
                    NaN, NaN
                );
            }
            UniformMatrix2fv.prototype.bind = function(value) {
                if (this.value.notEquals(value)) {
                    _gl.uniformMatrix2fv(this.location, false, value.elements);
                    this.value.copy(value);
                }
            };

            function UniformMatrix3fv(location) {
                this.location = location;
                this.value = new Mat3(
                    NaN, NaN, NaN,
                    NaN, NaN, NaN,
                    NaN, NaN, NaN
                );
            }
            UniformMatrix3fv.prototype.bind = function(value) {
                if (this.value.notEquals(value)) {
                    _gl.uniformMatrix3fv(this.location, false, value.elements);
                    this.value.copy(value);
                }
            };

            function UniformMatrix4fv(location) {
                this.location = location;
                this.value = new Mat4(
                    NaN, NaN, NaN, NaN,
                    NaN, NaN, NaN, NaN,
                    NaN, NaN, NaN, NaN,
                    NaN, NaN, NaN, NaN
                );
            }
            UniformMatrix4fv.prototype.bind = function(value) {
                if (this.value.notEquals(value)) {
                    _gl.uniformMatrix4fv(this.location, false, value.elements);
                    this.value.copy(value);
                }
            };

            function UniformTexture(location) {
                this.location = location;
            }
            UniformTexture.prototype.bind = function(value) {
                setTexture(this.location, value);
            };

            function UniformTextureCube(location) {
                this.location = location;
            }
            UniformTextureCube.prototype.bind = function(value) {
                setTextureCube(this.location, value);
            };
        }

        EventEmitter.extend(Renderer);


        var sprite_vertex = [
            "uniform mat4 matrix;",
            "uniform vec4 crop;",
            "uniform vec2 size;",

            "attribute vec2 position;",
            "attribute vec2 uv;",

            "varying vec2 vUv;",

            "void main() {",

            "	vUv = vec2(uv.x * crop.z, uv.y * crop.w) + crop.xy;",
            "	gl_Position = matrix * vec4(position * size, 0.0, 1.0);",
            "}"
        ].join("\n"),

            sprite_fragment = [
                "uniform float alpha;",
                "uniform sampler2D texture;",

                "varying vec2 vUv;",

                "void main() {",
                "	vec4 finalColor = texture2D(texture, vUv);",
                "	finalColor.w *= alpha;",

                "	gl_FragColor = finalColor;",
                "}"
            ].join("\n");


        return Renderer;
    }
);
