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
        "odin/math/vec3",
        "odin/math/mat4",
        "odin/core/enums",
        "odin/core/game/log",
        "odin/core/components/particle_system/emitter",
        "odin/core/renderer/shader_chunks",
        "odin/core/renderer/canvas"
    ],
    function(EventEmitter, Device, Dom, util, Mathf, Color, Vec3, Mat4, Enums, Log, Emitter, ShaderChunks, Canvas) {
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
                _color = new Color,
                _vector3 = new Vec3,
                _vector3_2 = new Vec3,
                _gl,
                _extensions,
                _canvas,
                _element,
                _context = false,
                _programs = [],

                _spriteBuffers = undefined,
                _spriteShader = undefined;


            this.attributes = merge(opts.attributes || {}, {
                alpha: true,
                antialias: true,
                depth: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                stencil: true
            });

            this.autoClear = opts.autoClear != undefined ? opts.autoClear : true;
            this.autoClearColor = opts.autoClearColor != undefined ? opts.autoClearColor : true;
            this.autoClearDepth = opts.autoClearDepth != undefined ? opts.autoClearDepth : true;
            this.autoClearStencil = opts.autoClearStencil != undefined ? opts.autoClearStencil : true;


            this.init = function(canvas) {
                if (_canvas) this.clear();

                _canvas = canvas;
                _element = canvas.element;

                initGL();
                _context = true;
                setDefaultGLState();

                addEvent(_element, "webglcontextlost", handleWebGLContextLost, this);
                addEvent(_element, "webglcontextrestored", handleWebGLContextRestored, this);

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
                _programs.length = 0;

                _extensions = undefined;

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

                _lastBuffer = undefined;
                _lastProgram = undefined;
                _enabledAttributes = undefined;

                _spriteBuffers = undefined;
                _spriteShader = undefined;

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


            var _textureIndex = 0;

            function setTexture(location, texture) {
                if (!texture || !texture.raw) return;
                var index, glTexture;

                if (_textureIndex >= _maxTextures) {
                    Log.warn("Renderer setTexure: using " + _textureIndex + " texture units, GPU only supports " + _maxTextures);
                }

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
                    generateMipmap = texture.generateMipmap,
                    filter = texture.filter,
                    format = texture.format,
                    wrap = texture.wrap,
                    WRAP, MAG_FILTER, MIN_FILTER, FORMAT;

                if (filter === FilterMode.None) {
                    MAG_FILTER = _gl.NEAREST;
                    if (generateMipmap && isPOT) {
                        MIN_FILTER = _gl.LINEAR_MIPMAP_NEAREST;
                    } else {
                        MIN_FILTER = _gl.NEAREST;
                    }
                } else { //FilterMode.Linear
                    MAG_FILTER = _gl.LINEAR;
                    if (generateMipmap && isPOT) {
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

                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, texture.flipY ? 1 : 0);
                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha ? 1 : 0);

                _gl.texImage2D(TEXTURE_2D, 0, FORMAT, FORMAT, _gl.UNSIGNED_BYTE, clampToMaxSize(raw, _maxTextureSize));

                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, MAG_FILTER);
                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, MIN_FILTER);

                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_WRAP_S, WRAP);
                _gl.texParameteri(TEXTURE_2D, _gl.TEXTURE_WRAP_T, WRAP);

                if (TFA) _gl.texParameterf(TEXTURE_2D, TFA.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
                if (generateMipmap && isPOT) _gl.generateMipmap(TEXTURE_2D);

                texture.needsUpdate = false;
            }


            function setTextureCube(location, cubeTexture) {
                if (!cubeTexture || !cubeTexture.raw) return;
                var glTexture = cubeTexture._webgl,
                    index;

                if (_textureIndex >= _maxTextures) {
                    Log.warn("Renderer setTexure: using " + _textureIndex + " texture units, GPU only supports " + _maxTextures);
                    return;
                }

                if (!cubeTexture.needsUpdate && glTexture) {
                    index = _textureIndex++;

                    _gl.activeTexture(_gl.TEXTURE0 + index);
                    _gl.bindTexture(_gl.TEXTURE_CUBE_MAP, glTexture);
                    _gl.uniform1i(location, index);

                    return;
                }

                glTexture = cubeTexture._webgl || (cubeTexture._webgl = _gl.createTexture());
                index = _textureIndex++;

                var raw = cubeTexture.raw,
                    TFA = _extensions.EXT_texture_filter_anisotropic,

                    first = raw[0],
                    isPOT = isPowerOfTwo(first.width) && isPowerOfTwo(first.height),
                    anisotropy = clamp(cubeTexture.anisotropy || 1, 1, _maxAnisotropy),

                    TEXTURE_CUBE_MAP = _gl.TEXTURE_CUBE_MAP,
                    TEXTURE_CUBE_MAP_POSITIVE_X = _gl.TEXTURE_CUBE_MAP_POSITIVE_X,
                    UNSIGNED_BYTE = _gl.UNSIGNED_BYTE,

                    generateMipmap = cubeTexture.generateMipmap,
                    filter = cubeTexture.filter,
                    format = cubeTexture.format,
                    wrap = cubeTexture.wrap,
                    WRAP, MAG_FILTER, MIN_FILTER, FORMAT,
                    current, i;

                if (filter === FilterMode.None) {
                    MAG_FILTER = _gl.NEAREST;
                    if (generateMipmap && isPOT) {
                        MIN_FILTER = _gl.LINEAR_MIPMAP_NEAREST;
                    } else {
                        MIN_FILTER = _gl.NEAREST;
                    }
                } else { //FilterMode.Linear
                    MAG_FILTER = _gl.LINEAR;
                    if (generateMipmap && isPOT) {
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
                } else { //TextureWrap.Repeat
                    WRAP = isPOT ? _gl.REPEAT : _gl.CLAMP_TO_EDGE;
                }

                _gl.activeTexture(_gl.TEXTURE0 + index);
                _gl.bindTexture(TEXTURE_CUBE_MAP, glTexture);
                _gl.uniform1i(location, index);

                _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, cubeTexture.flipY ? 1 : 0);
                _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, cubeTexture.premultiplyAlpha ? 1 : 0);

                _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, FORMAT, FORMAT, UNSIGNED_BYTE, clampToMaxSize(raw[0], _maxCubeTextureSize));
                _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, FORMAT, FORMAT, UNSIGNED_BYTE, clampToMaxSize(raw[1], _maxCubeTextureSize));
                _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, FORMAT, FORMAT, UNSIGNED_BYTE, clampToMaxSize(raw[2], _maxCubeTextureSize));
                _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, FORMAT, FORMAT, UNSIGNED_BYTE, clampToMaxSize(raw[3], _maxCubeTextureSize));
                _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, FORMAT, FORMAT, UNSIGNED_BYTE, clampToMaxSize(raw[4], _maxCubeTextureSize));
                _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, FORMAT, FORMAT, UNSIGNED_BYTE, clampToMaxSize(raw[5], _maxCubeTextureSize));

                _gl.texParameteri(TEXTURE_CUBE_MAP, _gl.TEXTURE_MAG_FILTER, MAG_FILTER);
                _gl.texParameteri(TEXTURE_CUBE_MAP, _gl.TEXTURE_MIN_FILTER, MIN_FILTER);

                _gl.texParameteri(TEXTURE_CUBE_MAP, _gl.TEXTURE_WRAP_S, WRAP);
                _gl.texParameteri(TEXTURE_CUBE_MAP, _gl.TEXTURE_WRAP_T, WRAP);

                if (TFA) _gl.texParameterf(TEXTURE_CUBE_MAP, TFA.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
                if (generateMipmap && isPOT) _gl.generateMipmap(TEXTURE_CUBE_MAP);

                cubeTexture.needsUpdate = false;
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


            function initMeshBuffers(mesh) {
                if (!mesh.dynamic && mesh._webgl.inittedBuffers) return mesh._webgl;
                var webgl = mesh._webgl,
                    DRAW = mesh.dynamic ? _gl.DYNAMIC_DRAW : _gl.STATIC_DRAW,
                    ARRAY_BUFFER = _gl.ARRAY_BUFFER,
                    ELEMENT_ARRAY_BUFFER = _gl.ELEMENT_ARRAY_BUFFER,
                    bufferArray, items, item, i, len, offset, vertexIndex;

                items = mesh.vertices || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.verticesNeedUpdate) {
                    bufferArray = webgl.vertexArray;
                    if (!bufferArray || bufferArray.length !== len * 3) {
                        bufferArray = webgl.vertexArray = new Float32Array(len * 3);
                        webgl.vertexCount = len;
                    }

                    for (i = 0; i < len; i++) {
                        item = items[i];
                        offset = i * 3;

                        bufferArray[offset] = item.x;
                        bufferArray[offset + 1] = item.y;
                        bufferArray[offset + 2] = item.z;
                    }

                    webgl.vertexBuffer = webgl.vertexBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.vertexBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.verticesNeedUpdate = false;
                }

                items = mesh.normals || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.normalsNeedUpdate) {
                    bufferArray = webgl.normalArray;
                    if (!bufferArray || bufferArray.length !== len * 3) bufferArray = webgl.normalArray = new Float32Array(len * 3);

                    for (i = 0; i < len; i++) {
                        item = items[i];
                        offset = i * 3;

                        bufferArray[offset] = item.x;
                        bufferArray[offset + 1] = item.y;
                        bufferArray[offset + 2] = item.z;
                    }

                    webgl.normalBuffer = webgl.normalBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.normalBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.normalsNeedUpdate = false;
                }

                items = mesh.tangents || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.tangentsNeedUpdate) {
                    bufferArray = webgl.tangentArray;
                    if (!bufferArray || bufferArray.length !== len * 4) bufferArray = webgl.tangentArray = new Float32Array(len * 4);

                    for (i = 0; i < len; i++) {
                        item = items[i];
                        offset = i * 4;

                        bufferArray[offset] = item.x;
                        bufferArray[offset + 1] = item.y;
                        bufferArray[offset + 2] = item.z;
                        bufferArray[offset + 3] = item.w;
                    }

                    webgl.tangentBuffer = webgl.tangentBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.tangentBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.tangentsNeedUpdate = false;
                }

                items = mesh.indices || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.indicesNeedUpdate) {
                    bufferArray = webgl.indexArray;
                    if (!bufferArray || bufferArray.length !== len) {
                        bufferArray = webgl.indexArray = new Uint16Array(len);
                        webgl.indexCount = len;
                    }

                    for (i = 0; i < len; i++) bufferArray[i] = items[i];

                    webgl.indexBuffer = webgl.indexBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ELEMENT_ARRAY_BUFFER, webgl.indexBuffer);
                    _gl.bufferData(ELEMENT_ARRAY_BUFFER, bufferArray, DRAW);

                    bufferArray = webgl.lineArray;
                    if (!bufferArray || bufferArray.length !== len * 3) {
                        bufferArray = webgl.lineArray = new Uint16Array(len * 3);
                        webgl.lineCount = len * 3;
                    }

                    vertexIndex = offset = 0;
                    for (i = 0; i < len; i++) {

                        bufferArray[offset] = items[vertexIndex];
                        bufferArray[offset + 1] = items[vertexIndex + 1];

                        bufferArray[offset + 2] = items[vertexIndex];
                        bufferArray[offset + 3] = items[vertexIndex + 2];

                        bufferArray[offset + 4] = items[vertexIndex + 1];
                        bufferArray[offset + 5] = items[vertexIndex + 2];

                        offset += 6;
                        vertexIndex += 3;
                    }

                    webgl.lineBuffer = webgl.lineBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ELEMENT_ARRAY_BUFFER, webgl.lineBuffer);
                    _gl.bufferData(ELEMENT_ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.indicesNeedUpdate = false;
                }

                items = mesh.colors || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.colorsNeedUpdate) {
                    bufferArray = webgl.colorArray;
                    if (!bufferArray || bufferArray.length !== len * 3) bufferArray = webgl.colorArray = new Float32Array(len * 3);

                    for (i = 0; i < len; i++) {
                        item = items[i];
                        offset = i * 3;

                        bufferArray[offset] = item.x;
                        bufferArray[offset + 1] = item.y;
                        bufferArray[offset + 2] = item.z;
                    }

                    webgl.colorBuffer = webgl.colorBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.colorBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.colorsNeedUpdate = false;
                }

                items = mesh.uvs || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.uvsNeedUpdate) {
                    bufferArray = webgl.uvArray;
                    if (!bufferArray || bufferArray.length !== len * 2) bufferArray = webgl.uvArray = new Float32Array(len * 2);

                    for (i = 0; i < len; i++) {
                        item = items[i];
                        offset = i * 2;

                        bufferArray[offset] = item.x;
                        bufferArray[offset + 1] = item.y;
                    }

                    webgl.uvBuffer = webgl.uvBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.uvBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.uvsNeedUpdate = false;
                }

                items = mesh.boneIndices || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.boneIndicesNeedUpdate) {
                    bufferArray = webgl.boneIndexArray;
                    if (!bufferArray || bufferArray.length !== len) bufferArray = webgl.boneIndexArray = new Uint16Array(len);

                    for (i = 0; i < len; i++) bufferArray[i] = items[i];

                    webgl.boneIndexBuffer = webgl.boneIndexBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.boneIndexBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.boneIndicesNeedUpdate = false;
                }

                items = mesh.boneWeights || EMPTY_ARRAY;
                len = items.length;
                if (len && mesh.boneWeightsNeedUpdate) {
                    bufferArray = webgl.boneWeightArray;
                    if (!bufferArray || bufferArray.length !== len) bufferArray = webgl.boneWeightArray = new Float32Array(len);

                    for (i = 0; i < len; i++) bufferArray[i] = items[i];

                    webgl.boneWeightBuffer = webgl.boneWeightBuffer || _gl.createBuffer();
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.boneWeightBuffer);
                    _gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                    mesh.boneWeightsNeedUpdate = false;
                }

                webgl.inittedBuffers = true;

                return webgl;
            }


            function initEmitterBuffers(emitter, transform, attributes) {
                var MAX = Emitter.MAX_PARTICLES,

                    webgl = emitter._webgl,
                    DRAW = _gl.DYNAMIC_DRAW,
                    FLOAT = _gl.FLOAT,
                    ARRAY_BUFFER = _gl.ARRAY_BUFFER,

                    positionArray, dataArray,
                    positionBuffer, dataBuffer,

                    particles = emitter.particles,
                    particle,
                    i = 0,
                    len = particles.length,
                    offset, position,
                    me, x, y, z,
                    m13, m23, m33, m43,
                    m14, m24, m34, m44

                if (len) {
                    if (emitter.sort) {
                        _mat4.mmul(_projScreenMatrix, transform.matrixWorld);
                        me = _mat4.elements;
                        m13 = me[2];
                        m23 = me[6];
                        m33 = me[10];
                        m43 = me[14];
                        m14 = me[3];
                        m24 = me[7];
                        m34 = me[11];
                        m44 = me[15];

                        i = len;
                        while (i--) {
                            particle = particles[i];
                            position = particle.position;
                            x = position.x;
                            y = position.y;
                            z = position.z;

                            particle.z = (m13 * x + m23 * y + m33 * z + m43) / (m14 * x + m24 * y + m34 * z + m44);
                        }

                        particles.sort(zSort);
                    }

                    positionArray = webgl.positionArray || (webgl.positionArray = new Float32Array(MAX * 3));
                    dataArray = webgl.dataArray || (webgl.dataArray = new Float32Array(MAX * 3));

                    i = len;
                    while (i--) {
                        particle = particles[i];
                        position = particle.position;
                        offset = i * 3;

                        positionArray[offset] = position.x;
                        positionArray[offset + 1] = position.y;
                        positionArray[offset + 2] = position.z;

                        dataArray[offset] = particle.angle;
                        dataArray[offset + 1] = particle.size;
                        dataArray[offset + 2] = particle.alpha;
                    }

                    disableAttributes();

                    positionBuffer = webgl.positionBuffer || (webgl.positionBuffer = _gl.createBuffer());
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.positionBuffer);
                    _gl.bufferData(ARRAY_BUFFER, positionArray, DRAW);
                    enableAttribute(attributes.position);
                    _gl.vertexAttribPointer(attributes.position, 3, FLOAT, false, 0, 0);

                    dataBuffer = webgl.dataBuffer || (webgl.dataBuffer = _gl.createBuffer());
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.dataBuffer);
                    _gl.bufferData(ARRAY_BUFFER, dataArray, DRAW);
                    enableAttribute(attributes.data);
                    _gl.vertexAttribPointer(attributes.data, 3, FLOAT, false, 0, 0);
                }

                webgl.particleCount = len;
                _lastBuffer = webgl;

                return webgl;
            }


            function zSort(a, b) {

                return b.z - a.z;
            }


            function initShader(material, mesh, lights) {
                if (!material.needsUpdate && material._webgl) return material._webgl;

                var shader = material.shader,
                    uniforms = material.uniforms,
                    OES_standard_derivatives = !! _extensions.OES_standard_derivatives,
                    parameters = {};

                parameters.mobile = Device.mobile;
                parameters.useLights = shader.lights;
                parameters.useShadows = shader.shadows;
                parameters.useFog = shader.fog;
                parameters.useBones = mesh.useBones && mesh.bones.length > 0;
                parameters.useVertexLit = shader.vertexLit;
                parameters.useSpecular = shader.specular;

                parameters.useNormal = !! uniforms.normalMap;
                parameters.useBump = !! uniforms.bumpMap;

                parameters.positions = mesh.vertices.length > 0;
                parameters.normals = mesh.normals.length > 0;
                parameters.tangents = mesh.tangents.length > 0;
                parameters.uvs = mesh.uvs.length > 0;
                parameters.colors = mesh.colors.length > 0;

                parameters.OES_standard_derivatives = OES_standard_derivatives && shader.OES_standard_derivatives;

                allocateLights(lights, parameters);
                allocateShadows(lights, parameters);

                material._webgl = createShaderProgram(shader.vertex, shader.fragment, parameters);
                material.needsUpdate = false;

                return material._webgl;
            }


            function initSpriteShader(material, sprite, lights) {
                if (!material.needsUpdate && material._webgl) return material._webgl;

                var shader = material.shader,
                    uniforms = material.uniforms,
                    OES_standard_derivatives = !! _extensions.OES_standard_derivatives,
                    parameters = {};

                parameters.mobile = Device.mobile;
                parameters.useLights = shader.lights;
                parameters.useShadows = shader.shadows;
                parameters.useFog = shader.fog;
                parameters.useBones = mesh.useBones && mesh.bones.length > 0;
                parameters.useVertexLit = shader.vertexLit;
                parameters.useSpecular = shader.specular;

                parameters.useNormal = !! uniforms.normalMap;
                parameters.useBump = !! uniforms.bumpMap;

                parameters.positions = mesh.vertices.length > 0;
                parameters.normals = mesh.normals.length > 0;
                parameters.tangents = mesh.tangents.length > 0;
                parameters.uvs = mesh.uvs.length > 0;
                parameters.colors = mesh.colors.length > 0;

                parameters.OES_standard_derivatives = OES_standard_derivatives && shader.OES_standard_derivatives;

                allocateLights(lights, parameters);
                allocateShadows(lights, parameters);

                material._webgl = createShaderProgram(shader.vertex, shader.fragment, parameters);
                material.needsUpdate = false;

                return material._webgl;
            }


            function initEmitterShader(material, emitter, lights) {
                if (!material.needsUpdate && material._webgl) return material._webgl;

                var shader = material.shader,
                    webgl = emitter._webgl,
                    uniforms = material.uniforms,
                    OES_standard_derivatives = !! _extensions.OES_standard_derivatives,
                    parameters = {};

                parameters.emitter = true;
                parameters.mobile = Device.mobile;
                parameters.useLights = shader.lights;
                parameters.useShadows = shader.shadows;
                parameters.useFog = shader.fog;
                parameters.useBones = false;
                parameters.useVertexLit = shader.vertexLit;
                parameters.useSpecular = shader.specular;

                parameters.useNormal = !! uniforms.normalMap;
                parameters.useBump = !! uniforms.bumpMap;

                parameters.positions = true;
                parameters.normals = false;
                parameters.tangents = false;
                parameters.uvs = false;
                parameters.colors = false;

                parameters.OES_standard_derivatives = OES_standard_derivatives && shader.OES_standard_derivatives;

                allocateLights(lights, parameters);
                allocateShadows(lights, parameters);

                material._webgl = createShaderProgram(shader.vertex, shader.fragment, parameters);
                material.needsUpdate = false;

                return material._webgl;
            }


            function allocateLights(lights, parameters) {
                var maxPointLights = 0,
                    maxDirectionalLights = 0,
                    maxSpotLights = 0,
                    maxHemiLights = 0,
                    light, type,
                    i = 0,
                    il = lights.length;

                for (; i < il; i++) {
                    light = lights[i];
                    if (!light.visible || light.onlyShadow) continue;
                    type = light.type;

                    if (type === LightType.Point) {
                        maxPointLights++;
                    } else if (type === LightType.Directional) {
                        maxDirectionalLights++;
                    } else if (type === LightType.Spot) {
                        maxSpotLights++;
                    } else if (type === LightType.Hemi) {
                        maxHemiLights++;
                    }
                }

                parameters.maxPointLights = maxPointLights;
                parameters.maxDirectionalLights = maxDirectionalLights;
                parameters.maxSpotLights = maxSpotLights;
                parameters.maxHemiLights = maxHemiLights;
            }


            function allocateShadows(lights, parameters) {
                var maxShadows = 0,
                    light, type,
                    i = 0,
                    il = lights.length;

                for (; i < il; i++) {
                    light = lights[i];
                    if (!light.visible || !light.castShadow) continue;
                    type = light.type;

                    if (type === LightType.Directional) {
                        maxShadows++;
                    } else if (type === LightType.Spot) {
                        maxShadows++;
                    }
                }

                parameters.maxShadows = maxShadows;
            }


            var HEADER = /([\s\S]*)?(void[\s]+main)/,
                MAIN_FUNCTION = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{([^}]*)}/,
                MAIN_SPLITER = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{/;

            function createShaderProgram(vertexShader, fragmentShader, parameters) {
                var chunks = [],
                    key, program, code, i;

                chunks.push(fragmentShader, vertexShader);
                for (key in parameters) chunks.push(key, parameters[key]);

                code = chunks.join();

                for (i = _programs.length; i--;) {
                    program = _programs[i];

                    if (program.code === code) {
                        program.used++;
                        return program;
                    }
                }

                program = new Shader(vertexShader, fragmentShader, parameters, code);
                return program;
            }


            var _lastBuffer = undefined;

            function bindSprite(attributes, wireframe) {
                if (_lastBuffer === _spriteBuffers) return;

                var ARRAY_BUFFER = _gl.ARRAY_BUFFER,
                    FLOAT = _gl.FLOAT;


                if (attributes.position > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, _spriteBuffers.vertexBuffer);
                    enableAttribute(attributes.position);
                    _gl.vertexAttribPointer(attributes.position, 3, FLOAT, false, 0, 0);
                }
                if (attributes.uv > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, _spriteBuffers.uvBuffer);
                    enableAttribute(attributes.uv);
                    _gl.vertexAttribPointer(attributes.uv, 2, FLOAT, false, 0, 0);
                }

                _lastBuffer = _spriteBuffers;
            }

            function bindMesh(mesh, attributes, wireframe) {
                if (_lastBuffer === mesh._webgl) return;
                disableAttributes();

                var webgl = mesh._webgl,
                    ARRAY_BUFFER = _gl.ARRAY_BUFFER,
                    FLOAT = _gl.FLOAT;

                if (webgl.vertexBuffer && attributes.position > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.vertexBuffer);
                    enableAttribute(attributes.position);
                    _gl.vertexAttribPointer(attributes.position, 3, FLOAT, false, 0, 0);
                }
                if (webgl.normalBuffer && attributes.normal > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.normalBuffer);
                    enableAttribute(attributes.normal);
                    _gl.vertexAttribPointer(attributes.normal, 3, FLOAT, false, 0, 0);
                }
                if (webgl.tangentBuffer && attributes.tangent > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.tangentBuffer);
                    enableAttribute(attributes.tangent);
                    _gl.vertexAttribPointer(attributes.tangent, 4, FLOAT, false, 0, 0);
                }
                if (webgl.colorBuffer && attributes.color > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.colorBuffer);
                    enableAttribute(attributes.color);
                    _gl.vertexAttribPointer(attributes.color, 3, FLOAT, false, 0, 0);
                }
                if (webgl.uvBuffer && attributes.uv > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.uvBuffer);
                    enableAttribute(attributes.uv);
                    _gl.vertexAttribPointer(attributes.uv, 2, FLOAT, false, 0, 0);
                }
                if (webgl.boneIndexBuffer && attributes.boneIndex > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.boneIndexBuffer);
                    enableAttribute(attributes.boneIndex);
                    _gl.vertexAttribPointer(attributes.boneIndex, 1, FLOAT, false, 0, 0);
                }
                if (webgl.boneWeightBuffer && attributes.boneWeight > -1) {
                    _gl.bindBuffer(ARRAY_BUFFER, webgl.boneWeightBuffer);
                    enableAttribute(attributes.boneWeight);
                    _gl.vertexAttribPointer(attributes.boneWeight, 3, FLOAT, false, 0, 0);
                }

                if (wireframe) {
                    if (webgl.lineBuffer) _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, webgl.lineBuffer);
                } else {
                    if (webgl.indexBuffer) _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, webgl.indexBuffer);
                }

                _lastBuffer = mesh._webgl;
            }


            var _enabledAttributes = undefined;

            function enableAttribute(attribute) {

                if (_enabledAttributes[attribute] === 0) {
                    _gl.enableVertexAttribArray(attribute);
                    _enabledAttributes[attribute] = 1;
                }
            };


            function disableAttributes() {
                var i = _maxAttributes;

                while (i--) {

                    if (_enabledAttributes[i] === 1) {
                        _gl.disableVertexAttribArray(i);
                        _enabledAttributes[i] = 0;
                    }
                }
            };


            function bindMaterial(material, transform, camera, lights, ambient) {
                var shader = material._webgl;

                material._webgl.bind(material, transform, camera, lights, ambient);
            };


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
                    };

                    _canvas.on("resize", _lastResizeFn);
                    _lastCamera = camera;
                }
                if (scene && _lastScene !== scene) {

                    _lastScene = scene;
                }

                _projScreenMatrix.mmul(camera.projection, camera.view);
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
                    ambient = scene.world.ambient,
                    lights = components.Light || EMPTY_ARRAY,
                    meshFilters = components.MeshFilter || EMPTY_ARRAY,
                    sprites = components.Sprite || EMPTY_ARRAY,
                    particleSystems = components.ParticleSystem || EMPTY_ARRAY,
                    meshFilter, particleSystem, sprite, transform, transform2d,
                    i;

                for (i = meshFilters.length; i--;) {
                    meshFilter = meshFilters[i];
                    transform = meshFilter.transform;

                    if (!transform) continue;

                    transform.updateMatrices(camera.view);
                    renderMeshFilter(camera, lights, ambient, transform, meshFilter);
                }

                for (i = sprites.length; i--;) {
                    sprite = sprites[i];
                    transform = sprite.transform;

                    if (!transform) continue;

                    transform.updateMatrices(camera.view);
                    renderSprite(camera, lights, ambient, transform, sprite);
                }

                for (i = particleSystems.length; i--;) {
                    particleSystem = particleSystems[i];
                    transform = particleSystem.transform;

                    if (!transform) continue;

                    transform.updateMatrices(camera.view);
                    renderParticleSystem(camera, lights, ambient, transform, particleSystem);
                }

                setCullFace(cullFace);
                setBlending(blending);
                setLineWidth(lineWidth);
            };


            function renderMeshFilter(camera, lights, ambient, transform, meshFilter) {
                var mesh = meshFilter.mesh,
                    material = meshFilter.material,
                    side = material.side,

                    buffers = initMeshBuffers(mesh),
                    shader = initShader(material, mesh, lights);

                shader.bind(material, transform, camera, lights, ambient);
                bindMesh(mesh, shader.attributes, material.wireframe);

                setBlending(material.blending);

                if (side === Side.Front) {
                    setCullFace(CullFace.Back);
                } else if (side === Side.Back) {
                    setCullFace(CullFace.Front);
                } else if (side === Side.Both) {
                    setCullFace();
                }

                if (material.wireframe) {
                    setLineWidth(material.wireframeLineWidth);
                    _gl.drawElements(_gl.LINES, buffers.lineCount, _gl.UNSIGNED_SHORT, 0);
                } else {
                    _gl.drawElements(_gl.TRIANGLES, buffers.indexCount, _gl.UNSIGNED_SHORT, 0);
                }
            }


            function renderSprite(camera, lights, ambient, transform, sprite) {
                var material = sprite.material,
                    texture = sprite.texture,
                    side, buffers, shader;

                if (material) {
                    side = material.side;
                    shader = initSpriteShader(material, sprite, lights);

                    shader.bind(material, transform, camera, lights, ambient);
                    bindSprite(_spriteShader.attributes, material.wireframe);

                    setBlending(material.blending);

                    if (side === Side.Front) {
                        setCullFace(CullFace.Back);
                    } else if (side === Side.Back) {
                        setCullFace(CullFace.Front);
                    } else if (side === Side.Both) {
                        setCullFace();
                    }

                    if (material.wireframe) {
                        setLineWidth(material.wireframeLineWidth);
                        _gl.drawArrays(_gl.LINE_LOOP, 0, _spriteBuffers.vertexCount);
                    } else {
                        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, _spriteBuffers.vertexCount);
                    }
                } else if (texture) {
                    var uniforms = _spriteShader.uniforms,
                        w, h;

                    if (texture.raw) {
                        w = texture.invWidth;
                        h = texture.invHeight;
                    } else {
                        return;
                    }

                    _mat4.mmul(camera.projection, transform.modelView);

                    if (_lastShader !== _spriteShader) {
                        _gl.useProgram(_spriteShader.program);
                        _lastShader = _spriteShader;
                    }
                    bindSprite(_spriteBuffers, _spriteShader.attributes);

                    uniforms.matrix.bind(_mat4);
                    uniforms.crop.bind(VEC4.set(sprite.x * w, sprite.y * h, sprite.w * w, sprite.h * h));
                    uniforms.size.bind(VEC2.set(sprite.width, sprite.height));
                    uniforms.alpha.bind(sprite.alpha);
                    uniforms.texture.bind(texture);

                    _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, _spriteBuffers.vertexCount);
                    _textureIndex = 0;
                }
            }


            function renderParticleSystem(camera, lights, ambient, transform, particleSystem) {
                var emitters = particleSystem.emitters,
                    emitter, i = emitters.length,
                    material, shader, buffers;

                while (i--) {
                    emitter = emitters[i];
                    material = emitter.material;

                    shader = initEmitterShader(material, emitter, lights);
                    shader.bind(material, transform, camera, lights, ambient);

                    buffers = initEmitterBuffers(emitter, transform, shader.attributes);
                    if (!buffers.particleCount) continue;

                    setBlending(material.blending);
                    setCullFace(CullFace.Back);

                    _gl.drawArrays(_gl.POINTS, 0, buffers.particleCount);
                }
            }


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

                _enabledAttributes = new Uint8Array(_maxAttributes);
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

                _spriteBuffers = {};
                createBuffer(_spriteBuffers, "vertexBuffer", new Float32Array([-0.5, 0.5, 0, -0.5, -0.5, 0,
                    0.5, 0.5, 0,
                    0.5, -0.5, 0
                ]));
                createBuffer(_spriteBuffers, "uvBuffer", new Float32Array([
                    0, 0,
                    0, 1,
                    1, 0,
                    1, 1
                ]));
                _spriteBuffers.vertexCount = 4;
                _spriteShader = new SimpleShader(sprite_vertex, sprite_fragment);
            }


            function createBuffer(obj, name, array) {

                obj[name] = obj[name] || _gl.createBuffer();
                _gl.bindBuffer(_gl.ARRAY_BUFFER, obj[name]);
                _gl.bufferData(_gl.ARRAY_BUFFER, array, _gl.STATIC_DRAW);
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


            function SimpleShader(vertex, fragment) {
                var precision = "precision " + _precision + " float;\nprecision " + _precision + " int;\n",

                    glVertexShader = precision + vertex,
                    glFragmentShader = precision + fragment;

                this.vertex = vertex;
                this.fragment = fragment;

                this.attributes = {};
                this.uniforms = {};

                this.program = createProgram(_gl, glVertexShader, glFragmentShader);
                parseUniformsAttributes(this.program, glVertexShader, glFragmentShader, this.attributes, this.uniforms);
            }


            var HEADER = /([\s\S]*)?(void[\s]+main)/,
                MAIN_FUNCTION = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{([^}]*)}/,
                MAIN_SPLITER = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{/;

            function Shader(vertex, fragment, parameters, code, simple) {

                this.vertex = vertex;
                this.fragment = fragment;
                this.parameters = parameters;
                this.code = code;

                this.program = undefined;
                this.used = 1;
                this.attributes = undefined;
                this.uniforms = undefined;
                this._customAttributes = undefined;
                this._customUniforms = undefined;

                buildShader(this);
            }


            var _lastProgram = undefined;

            Shader.prototype.bind = function(material, transform, camera, lights, ambient) {
                var program = this.program,
                    parameters = this.parameters,
                    uniforms = this.uniforms,
                    i, length;

                if (_lastProgram !== program) {
                    _gl.useProgram(program);
                    _lastProgram = program;
                }

                if (uniforms.modelMatrix) uniforms.modelMatrix.bind(transform.matrixWorld);
                if (uniforms.modelViewMatrix) uniforms.modelViewMatrix.bind(transform.modelView);
                if (uniforms.projectionMatrix) uniforms.projectionMatrix.bind(camera.projection);
                if (uniforms.viewMatrix) uniforms.viewMatrix.bind(camera.view);
                if (uniforms.normalMatrix) uniforms.normalMatrix.bind(transform.normalMatrix);
                if (uniforms.cameraPosition) uniforms.cameraPosition.bind(_vector3.positionFromMat4(camera.transform.matrixWorld));
                if (uniforms.ambient) uniforms.ambient.bind(ambient);

                if (parameters.useLights && (length = lights.length)) {
                    var maxPointLights = parameters.maxPointLights,
                        maxDirectionalLights = parameters.maxDirectionalLights,
                        maxSpotLights = parameters.maxSpotLights,
                        maxHemiLights = parameters.maxHemiLights,

                        pointLights = 0,
                        pointLightColor = uniforms.pointLightColor,
                        pointLightPosition = uniforms.pointLightPosition,
                        pointLightDistance = uniforms.pointLightDistance,

                        directionalLights = 0,
                        directionalLightColor = uniforms.directionalLightColor,
                        directionalLightDirection = uniforms.directionalLightDirection,

                        spotLights = 0,
                        spotLightColor = uniforms.spotLightColor,
                        spotLightPosition = uniforms.spotLightPosition,
                        spotLightDirection = uniforms.spotLightDirection,
                        spotLightDistance = uniforms.spotLightDistance,
                        spotLightAngleCos = uniforms.spotLightAngleCos,
                        spotLightExponent = uniforms.spotLightExponent,

                        hemiLights = 0,
                        hemiLightColor = uniforms.hemiLightColor,
                        hemiLightDirection = uniforms.hemiLightDirection,

                        light, type;

                    for (i = 0; i < length; i++) {
                        light = lights[i];
                        if (!light.visible) continue;

                        type = light.type;
                        _color.copy(light.color).smul(light.energy);

                        if (pointLightColor.length && type === LightType.Point) {
                            if (pointLights >= maxPointLights) continue;

                            _vector3.positionFromMat4(light.transform.matrixWorld);

                            pointLightColor[pointLights].bind(_color);
                            pointLightPosition[pointLights].bind(_vector3);
                            pointLightDistance[pointLights].bind(light.distance);
                            pointLights++;
                        } else if (directionalLightColor.length && type === LightType.Directional) {
                            if (directionalLights >= maxDirectionalLights) continue;

                            _vector3.positionFromMat4(light.transform.matrixWorld).sub(light.target).normalize();
                            if (_vector3.lengthSq() === 0) continue;

                            directionalLightColor[directionalLights].bind(_color);
                            directionalLightDirection[directionalLights].bind(_vector3);
                            directionalLights++;

                        } else if (spotLightColor.length && type === LightType.Spot) {
                            if (spotLights >= maxSpotLights) continue;

                            _vector3.positionFromMat4(light.transform.matrixWorld);
                            if (_vector3.lengthSq() === 0) continue;

                            _vector3_2.copy(_vector3).sub(light.target).normalize();
                            if (_vector3_2.lengthSq() === 0) continue;

                            spotLightColor[spotLights].bind(_color);
                            spotLightPosition[spotLights].bind(_vector3);
                            spotLightDirection[spotLights].bind(_vector3_2);
                            spotLightDistance[spotLights].bind(light.distance);
                            spotLightAngleCos[spotLights].bind(light._angleCos);
                            spotLightExponent[spotLights].bind(light.exponent);
                            spotLights++;

                        } else if (hemiLightColor.length && type === LightType.Hemi) {
                            if (hemiLights >= maxHemiLights) continue;

                            _vector3.positionFromMat4(light.transform.matrixWorld).sub(light.target).normalize();
                            if (_vector3.lengthSq() === 0) continue;

                            hemiLightColor[hemiLights].bind(_color);
                            hemiLightDirection[hemiLights].bind(_vector3);
                            hemiLights++;
                        }
                    }
                }

                bindCustomUniforms(this._customUniforms, uniforms, material.name, material.uniforms);
                _textureIndex = 0;
            };

            function bindCustomUniforms(customUniforms, uniforms, materialName, materialUniforms) {
                var i = customUniforms.length,
                    customUniform, uniformValue, length, name, type, value, j;

                while (i--) {
                    customUniform = customUniforms[i];
                    name = customUniform.name;

                    uniformValue = uniforms[name];
                    value = materialUniforms[name];

                    if (!uniformValue) continue;
                    if (!value) throw "WebGLRenderer bindShader: material " + materialName + " was not given a uniform named " + name;

                    if ((length = uniformValue.length)) {
                        j = length;
                        while (j--) uniformValue.bind(value[j]);
                    } else {
                        uniformValue.bind(value);
                    }
                }
            }

            function buildShader(shader) {
                var parameters = shader.parameters,
                    vertexShader = shader.vertex,
                    fragmentShader = shader.fragment,
                    emitter = parameters.emitter,
                    useLights = parameters.useLights,
                    useShadows = parameters.useShadows,
                    useFog = parameters.useFog,
                    useBones = parameters.useBones,
                    useVertexLit = parameters.useVertexLit,
                    useSpecular = parameters.useSpecular,
                    OES_standard_derivatives = parameters.OES_standard_derivatives,

                    definesPrefix = [
                        "precision " + _precision + " float;",
                        "precision " + _precision + " int;",

                        useLights ? "#define USE_LIGHTS" : "",
                        useShadows ? "#define USE_SHADOWS" : "",
                        useBones ? "#define USE_SKINNING" : "",

                        useLights ? "#define MAX_DIR_LIGHTS " + parameters.maxDirectionalLights : "",
                        useLights ? "#define MAX_POINT_LIGHTS " + parameters.maxPointLights : "",
                        useLights ? "#define MAX_SPOT_LIGHTS " + parameters.maxSpotLights : "",
                        useLights ? "#define MAX_HEMI_LIGHTS " + parameters.maxHemiLights : "",

                        useShadows ? "#define MAX_SHADOWS " + parameters.maxShadows : "",
                        ""
                    ].join("\n"),

                    vertexPrefix = [
                        definesPrefix,

                        "uniform mat4 modelMatrix;",
                        "uniform mat4 modelViewMatrix;",
                        "uniform mat4 projectionMatrix;",
                        "uniform mat4 viewMatrix;",
                        "uniform mat3 normalMatrix;",
                        "uniform vec3 cameraPosition;",

                        parameters.positions ? "attribute vec3 position;" : "",
                        parameters.normals ? "attribute vec3 normal;" : "",
                        parameters.tangents ? "attribute vec4 tangent;" : "",
                        parameters.uvs ? "attribute vec2 uv;" : "",
                        parameters.colors ? "attribute vec3 color;" : "",
                        emitter ? "attribute vec3 data;" : "",

                        useBones ? "attribute int boneIndex;" : "",
                        useBones ? "attribute vec3 boneWeight;" : "",
                        useBones ? "uniform mat4 bone[" + parameters.bones + "];" : ""
                    ].join("\n"),

                    fragmentPrefix = [
                        OES_standard_derivatives ? "#extension GL_OES_standard_derivatives : enable" : "",
                        definesPrefix,

                        "uniform mat4 viewMatrix;",
                        "uniform vec3 cameraPosition;"
                    ].join("\n"),

                    glVertexShader = vertexPrefix + "\n" + vertexShader,
                    glFragmentShader = fragmentPrefix + "\n" + fragmentShader,

                    main = "void main(void) {\n",
                    footer = "\n}",

                    vertexHeader = glVertexShader.match(HEADER)[1],
                    vertexMain = glVertexShader.match(MAIN_FUNCTION)[5],
                    fragmentHeader = glFragmentShader.match(HEADER)[1],
                    fragmentMain = glFragmentShader.match(MAIN_FUNCTION)[5];

                if (emitter) {
                    vertexHeader += ShaderChunks.particle_header;
                    fragmentHeader += ShaderChunks.particle_header;
                    vertexMain = ShaderChunks.particle_vertex + vertexMain;
                }

                if (OES_standard_derivatives) {
                    if (parameters.useNormal) fragmentHeader += ShaderChunks.perturbNormal2Arb;
                    if (parameters.useBump) fragmentHeader += ShaderChunks.dHdxy_fwd + ShaderChunks.perturbNormalArb;
                }

                if (useLights) {
                    if (useVertexLit) {
                        vertexHeader += ShaderChunks.lights + ShaderChunks.VertexLight;
                    } else {
                        vertexHeader += ShaderChunks.perPixelVaryingHeader;
                        vertexMain = ShaderChunks.perPixelVaryingMain + vertexMain;

                        fragmentHeader += ShaderChunks.lights + ShaderChunks.perPixelVaryingHeader;
                        if (useSpecular) {
                            fragmentHeader += ShaderChunks.PixelLight;
                        } else {
                            fragmentHeader += ShaderChunks.PixelLightNoSpec;
                        }
                    }

                    vertexMain = ShaderChunks.mvPosition + vertexMain;
                    if (parameters.normals) vertexMain = ShaderChunks.transformedNormal + vertexMain;
                    vertexMain = ShaderChunks.worldPosition + vertexMain;
                } else {
                    vertexMain = ShaderChunks.mvPosition + vertexMain;
                }

                if (useBones) {
                    vertexHeader += ShaderChunks.getBoneMatrix;
                    if (parameters.normals) vertexMain = ShaderChunks.boneNormal + vertexMain;
                    vertexMain = ShaderChunks.bone + vertexMain;
                }

                glVertexShader = vertexHeader + main + vertexMain + footer;
                glFragmentShader = fragmentHeader + main + fragmentMain + footer;

                shader.program = createProgram(_gl, glVertexShader, glFragmentShader);

                parseUniformsAttributesCustom(vertexShader, fragmentShader, (shader._customAttributes = []), (shader._customUniforms = []));
                parseUniformsAttributes(shader.program, glVertexShader, glFragmentShader, (shader.attributes = {}), (shader.uniforms = {}));

                _programs.push(shader);
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
        ].join("\n");

        var sprite_fragment = [
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
