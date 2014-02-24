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
        "odin/core/rendering/shader_chunks",
        "odin/core/game/log",
        "odin/core/enums"
    ],
    function(EventEmitter, Device, Dom, util, Mathf, Rect, Vec2, Vec3, Mat4, Color, ShaderChunks, Log, Enums) {
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
            createProgram = Dom.createProgram,
            parseUniformsAttributes = Dom.parseUniformsAttributes,
            getUniformsAttributes = Dom.getUniformsAttributes,

            addEvent = Dom.addEvent,
            removeEvent = Dom.removeEvent,

            merge = util.merge,

            cos = Math.cos,
            max = Math.max,
            floor = Math.floor,
            clamp = Mathf.clamp,
            isPowerOfTwo = Mathf.isPowerOfTwo,

            EMPTY_ARRAY = [];


        /**
         * @class Renderer
         * @extends EventEmitter
         * @brief 2d webgl renderer
         * @param Object options
         */

        function Renderer(opts) {
            opts || (opts = {});

            EventEmitter.call(this);

            this.canvas = undefined;
            this.context = undefined;
            this._context = false;

            this.autoClear = opts.autoClear != undefined ? opts.autoClear : true;
            this.autoClearColor = opts.autoClearColor != undefined ? opts.autoClearColor : true;
            this.autoClearDepth = opts.autoClearDepth != undefined ? opts.autoClearDepth : true;
            this.autoClearStencil = opts.autoClearStencil != undefined ? opts.autoClearStencil : true;

            this.shadowMapEnabled = opts.shadowMapEnabled != undefined ? opts.shadowMapEnabled : false;
            this.shadowMapAutoUpdate = opts.shadowMapAutoUpdate != undefined ? opts.shadowMapAutoUpdate : true;
            this.shadowMapType = opts.shadowMapType != undefined ? opts.shadowMapType : ShadowMapType.PCFSoftShadowMap;
            this.shadowMapCullFace = opts.shadowMapCullFace != undefined ? opts.shadowMapCullFace : CullFace.Front;
            this.shadowMapDebug = opts.shadowMapDebug != undefined ? opts.shadowMapDebug : false;
            this.shadowMapCascade = opts.shadowMapCascade != undefined ? opts.shadowMapCascade : false;

            this.attributes = merge(opts.attributes || {}, {
                alpha: true,
                antialias: true,
                depth: true,
                premulipliedAlpha: true,
                preserveDrawingBuffer: false,
                stencil: true
            });

            this.precision = "highp";
            this.maxAnisotropy = 0;
            this.maxTextures = 0;
            this.maxVertexTextures = 0;
            this.maxTextureSize = 0;
            this.maxCubeTextureSize = 0;
            this.maxRenderBufferSize = 0;

            this.maxUniforms = 0;
            this.maxAttributes = 0;

            this.supportsVertexTextures = false;
            this.supportsFloatTextures = false;
            this.supportsStandardDerivatives = false;
            this.supportsCompressedTextureS3TC = false;
            this.supportsBoneTextures = false;
            this.compressedTextureFormats = [];

            this.glExtensionTextureFloat = undefined;
            this.glExtensionTextureFloatLinear = undefined;
            this.glExtensionStandardDerivatives = undefined;
            this.glExtensionTextureFilterAnisotropic = undefined;
            this.glExtensionCompressedTextureS3TC = undefined;
            this.glExtensionDrawBuffers = undefined;

            this._lastProgram = undefined;
            this._lastFramebuffer = undefined;
            this._uniformsIndex = 0;

            this._lastTexture = undefined;
            this._whiteTexture = undefined;
            this._textureIndex = 0;

            this._lastBuffer = undefined;

            this._lastCamera = undefined;
            this._lastScene = undefined;
            this._lastResizeFn = undefined;
            this._clearColor = new Color;
            this._clearAlpha = 1;

            this._lastDoubleSided = -1;
            this._lastFlipSided = -1;

            this._lastDepthTest = -1;
            this._lastDepthWrite = -1;

            this._lastLineWidth = undefined;
            this._lastBlending = undefined;

            this._programs = [];
        }

        EventEmitter.extend(Renderer);


        Renderer.prototype.init = function(canvas) {
            if (this.canvas) this.clear();
            var element = canvas.element;

            this.canvas = canvas;
            this.context = getWebGLContext(element, this.attributes);

            if (!this.context) return this;
            this._context = true;

            addEvent(element, "webglcontextlost", this._handleWebGLContextLost, this);
            addEvent(element, "webglcontextrestored", this._handleWebGLContextRestored, this);

            this.initGL();
            this.setDefaultGLState();

            return this;
        };


        Renderer.prototype.clear = function() {
            if (!this.canvas) return this;
            var canvas = this.canvas,
                element = canvas.element;

            removeEvent(element, "webglcontextlost", this._handleWebGLContextLost, this);
            removeEvent(element, "webglcontextrestored", this._handleWebGLContextRestored, this);

            this.canvas = undefined;
            this.context = undefined;
            this._context = false;

            this.glExtensionTextureFloat = undefined;
            this.glExtensionTextureFloatLinear = undefined;
            this.glExtensionStandardDerivatives = undefined;
            this.glExtensionTextureFilterAnisotropic = undefined;
            this.glExtensionCompressedTextureS3TC = undefined;
            this.glExtensionDrawBuffers = undefined;

            this.supportsVertexTextures = false;
            this.supportsFloatTextures = false;
            this.supportsStandardDerivatives = false;
            this.supportsCompressedTextureS3TC = false;
            this.supportsBoneTextures = false;
            this.compressedTextureFormats = [];

            this._lastProgram = undefined;
            this._lastFramebuffer = undefined;

            this._lastTexture = undefined;
            this._whiteTexture = undefined;
            this._textureIndex = 0;

            this._lastBuffer = undefined;

            this._lastCamera = undefined;
            this._lastScene = undefined;
            this._lastResizeFn = undefined;

            this._clearColor = new Color;
            this._clearAlpha = 1;

            this._lastDoubleSided = -1;
            this._lastFlipSided = -1;

            this._lastDepthTest = -1;
            this._lastDepthWrite = -1;

            this._lastLineWidth = undefined;
            this._lastBlending = undefined;
            this._lastCullFace = undefined;

            return this;
        };


        Renderer.prototype.initGL = function() {
            var gl = this.context,

                VERTEX_SHADER = gl.VERTEX_SHADER,
                FRAGMENT_SHADER = gl.FRAGMENT_SHADER,
                HIGH_FLOAT = gl.HIGH_FLOAT,
                MEDIUM_FLOAT = gl.MEDIUM_FLOAT,

                glExtensionTextureFilterAnisotropic = (
                    gl.getExtension("EXT_texture_filter_anisotropic") ||
                    gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
                    gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
                ),

                shaderPrecision = typeof(gl.getShaderPrecisionFormat) !== "undefined",

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

            this.glExtensionTextureFilterAnisotropic = glExtensionTextureFilterAnisotropic;
            this.glExtensionCompressedTextureS3TC = (
                gl.getExtension("WEBGL_compressed_texture_s3tc") ||
                gl.getExtension("MOZ_WEBGL_compressed_texture_s3tc") ||
                gl.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc")
            );
            this.glExtensionStandardDerivatives = gl.getExtension("OES_standard_derivatives");
            this.glExtensionTextureFloat = gl.getExtension("OES_texture_float");
            this.glExtensionTextureFloatLinear = gl.getExtension("OES_texture_float_linear");
            this.glExtensionDrawBuffers = gl.getExtension("WEBGL_draw_buffers");

            this.precision = precision;
            this.maxAnisotropy = glExtensionTextureFilterAnisotropic ? gl.getParameter(glExtensionTextureFilterAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
            this.maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
            this.maxVertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
            this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            this.maxCubeTextureSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
            this.maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);

            this.maxUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) * 4;
            this.maxAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);

            this.supportsVertexTextures = this.maxVertexTextures > 0;
            this.supportsFloatTextures = !! this.glExtensionTextureFloat;
            this.supportsStandardDerivatives = !! this.glExtensionStandardDerivatives;
            this.supportsCompressedTextureS3TC = !! this.glExtensionCompressedTextureS3TC;
            this.supportsBoneTextures = this.supportsVertexTextures && !! this.glExtensionTextureFloat;
            this.compressedTextureFormats = this.glExtensionCompressedTextureS3TC ? gl.getParameter(gl.COMPRESSED_TEXTURE_FORMATS) : [];

            this._whiteTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this._whiteTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            gl.bindTexture(gl.TEXTURE_2D, null);

            return this;
        };


        Renderer.prototype.setDefaultGLState = function() {
            var gl = this.context,
                clearColor = this._clearColor,
                canvas = this.canvas;

            gl.clearColor(0, 0, 0, 1);
            gl.clearDepth(1);
            gl.clearStencil(0);

            this.setDepthTest(true);
            gl.depthFunc(gl.LEQUAL);

            gl.frontFace(gl.CCW);

            this.setCullFace(CullFace.Back);
            this.setBlending(Blending.Default);

            this.setViewport();
            this.setClearColor(this._clearColor, this._clearAlpha);

            return this;
        };


        Renderer.prototype.setViewport = function(x, y, width, height) {
            var canvas = this.canvas;

            x || (x = 0);
            y || (y = 0);
            width || (width = canvas.pixelWidth);
            height || (height = canvas.pixelHeight);

            this.context.viewport(x, y, width, height);
        };


        Renderer.prototype.setDepthTest = function(depthTest) {

            if (this._lastDepthTest !== depthTest) {
                var gl = this.context;

                if (depthTest) {
                    gl.enable(gl.DEPTH_TEST);
                } else {
                    gl.disable(gl.DEPTH_TEST);
                }

                this._lastDepthTest = depthTest;
            }
        };


        Renderer.prototype.setDepthWrite = function(depthWrite) {

            if (this._lastDepthWrite !== depthWrite) {

                this.context.depthMask(depthWrite);
                this._lastDepthWrite = depthWrite;
            }
        };


        Renderer.prototype.setLineWidth = function(width) {

            if (this._lastLineWidth !== width) {

                this.context.lineWidth(width);
                this._lastLineWidth = width;
            }
        };


        Renderer.prototype.setCullFace = function(cullFace) {

            if (this._lastCullFace !== cullFace) {
                var gl = this.context,
                    disabled = false;

                if (!this._lastCullFace || this._lastCullFace === CullFace.None) disabled = true;

                if (cullFace === CullFace.Front) {
                    if (disabled) gl.enable(gl.CULL_FACE);
                    gl.cullFace(gl.FRONT);
                } else if (cullFace === CullFace.Back) {
                    if (disabled) gl.enable(gl.CULL_FACE);
                    gl.cullFace(gl.BACK);
                } else if (cullFace === CullFace.FrontBack) {
                    if (disabled) gl.enable(gl.CULL_FACE);
                    gl.cullFace(gl.FRONT_AND_BACK);
                } else {
                    gl.disable(gl.CULL_FACE);
                    this._lastCullFace = CullFace.None;
                    return;
                }

                this._lastCullFace = cullFace;
            }
        };


        Renderer.prototype.setBlending = function(blending) {

            if (blending !== this._lastBlending) {
                var gl = this.context;

                if (blending === Blending.None) {
                    gl.disable(gl.BLEND);
                } else if (blending === Blending.Additive) {
                    gl.enable(gl.BLEND);
                    gl.blendEquation(gl.FUNC_ADD);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                } else if (blending === Blending.Subtractive) {
                    gl.enable(gl.BLEND);
                    gl.blendEquation(gl.FUNC_ADD);
                    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
                } else if (blending === Blending.Muliply) {
                    gl.enable(gl.BLEND);
                    gl.blendEquation(gl.FUNC_ADD);
                    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
                } else if (blending === Blending.Default) {
                    gl.enable(gl.BLEND);
                    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
                    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                    this._lastBlending = Blending.Default;
                    return;
                }

                this._lastBlending = blending;
            }
        };


        Renderer.prototype.setScissor = function(x, y, width, height) {

            this.context.scissor(x, y, width, height);
        };


        Renderer.prototype.setClearColor = function(color, alpha) {
            var clearColor = this._clearColor;

            clearColor.set(color);
            this._clearAlpha = alpha !== undefined ? alpha : 1;

            this.context.clearColor(clearColor.r, clearColor.g, clearColor.b, this._clearAlpha);
        };


        Renderer.prototype.clearCanvas = function(color, depth, stencil) {
            var gl = this.context,
                bits = 0;

            if (color === undefined || color) bits |= gl.COLOR_BUFFER_BIT;
            if (depth === undefined || depth) bits |= gl.DEPTH_BUFFER_BIT;
            if (stencil === undefined || stencil) bits |= gl.STENCIL_BUFFER_BIT;

            gl.clear(bits);
        };


        Renderer.prototype.clearColor = function() {
            var gl = this.context;

            gl.clear(gl.COLOR_BUFFER_BIT);
        };


        Renderer.prototype.clearDepth = function() {
            var gl = this.context;

            gl.clear(gl.DEPTH_BUFFER_BIT);
        };


        Renderer.prototype.clearStencil = function() {
            var gl = this.context;

            gl.clear(gl.STENCIL_BUFFER_BIT);
        };


        Renderer.prototype._initMeshBuffers = function(mesh) {
            if (!mesh.dynamic && mesh._webgl.inittedBuffers) return mesh._webgl;
            var gl = this.context,
                webgl = mesh._webgl,
                DRAW = mesh.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW,
                ARRAY_BUFFER = gl.ARRAY_BUFFER,
                ELEMENT_ARRAY_BUFFER = gl.ELEMENT_ARRAY_BUFFER,
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

                webgl.vertexBuffer = webgl.vertexBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.vertexBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

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

                webgl.normalBuffer = webgl.normalBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.normalBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

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

                webgl.tangentBuffer = webgl.tangentBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.tangentBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

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

                webgl.indexBuffer = webgl.indexBuffer || gl.createBuffer();
                gl.bindBuffer(ELEMENT_ARRAY_BUFFER, webgl.indexBuffer);
                gl.bufferData(ELEMENT_ARRAY_BUFFER, bufferArray, DRAW);

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

                webgl.lineBuffer = webgl.lineBuffer || gl.createBuffer();
                gl.bindBuffer(ELEMENT_ARRAY_BUFFER, webgl.lineBuffer);
                gl.bufferData(ELEMENT_ARRAY_BUFFER, bufferArray, DRAW);

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

                webgl.colorBuffer = webgl.colorBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.colorBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                mesh.colorsNeedUpdate = false;
            }

            items = mesh.uvs || EMPTY_ARRAY;
            len = items.length;
            if (len && mesh.uvsNeedUpdate) {
                bufferArray = webgl.uvArray;
                if (!bufferArray || bufferArray.length !== len * 3) bufferArray = webgl.uvArray = new Float32Array(len * 2);

                for (i = 0; i < len; i++) {
                    item = items[i];
                    offset = i * 2;

                    bufferArray[offset] = item.x;
                    bufferArray[offset + 1] = item.y;
                }

                webgl.uvBuffer = webgl.uvBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.uvBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                mesh.uvsNeedUpdate = false;
            }

            items = mesh.boneIndices || EMPTY_ARRAY;
            len = items.length;
            if (len && mesh.boneIndicesNeedUpdate) {
                bufferArray = webgl.boneIndexArray;
                if (!bufferArray || bufferArray.length !== len) bufferArray = webgl.boneIndexArray = new Uint16Array(len);

                for (i = 0; i < len; i++) bufferArray[i] = items[i];

                webgl.boneIndexBuffer = webgl.boneIndexBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.boneIndexBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                mesh.boneIndicesNeedUpdate = false;
            }

            items = mesh.boneWeights || EMPTY_ARRAY;
            len = items.length;
            if (len && mesh.boneWeightsNeedUpdate) {
                bufferArray = webgl.boneWeightArray;
                if (!bufferArray || bufferArray.length !== len) bufferArray = webgl.boneWeightArray = new Float32Array(len);

                for (i = 0; i < len; i++) bufferArray[i] = items[i];

                webgl.boneWeightBuffer = webgl.boneWeightBuffer || gl.createBuffer();
                gl.bindBuffer(ARRAY_BUFFER, webgl.boneWeightBuffer);
                gl.bufferData(ARRAY_BUFFER, bufferArray, DRAW);

                mesh.boneWeightsNeedUpdate = false;
            }

            webgl.inittedBuffers = true;

            return webgl;
        };


        Renderer.prototype._initTexture = function(texture) {
            if (!texture || !texture.raw) return this._whiteTexture;
            if (!texture.needsUpdate && texture._webgl) return texture._webgl;

            var gl = this.context,
                glTexture = texture._webgl || (texture._webgl = gl.createTexture()),
                raw = texture.raw,
                maxAnisotropy = this.maxAnisotropy,
                maxTextureSize = this.maxTextureSize,
                TFA = this.glExtensionTextureFilterAnisotropic,

                isPOT = isPowerOfTwo(raw.width) && isPowerOfTwo(raw.height),
                anisotropy = clamp(texture.anisotropy || 1, 1, maxAnisotropy),

                TEXTURE_2D = gl.TEXTURE_2D,
                filter = texture.filter,
                format = texture.format,
                wrap = texture.wrap,
                WRAP, MAG_FILTER, MIN_FILTER, FORMAT;

            if (filter === FilterMode.None) {
                MAG_FILTER = gl.NEAREST;
                if (isPOT) {
                    MIN_FILTER = gl.LINEAR_MIPMAP_NEAREST;
                } else {
                    MIN_FILTER = gl.NEAREST;
                }
            } else { //FilterMode.Linear
                MAG_FILTER = gl.LINEAR;
                if (isPOT) {
                    MIN_FILTER = gl.LINEAR_MIPMAP_LINEAR;
                } else {
                    MIN_FILTER = gl.LINEAR;
                }
            }

            if (format === TextureFormat.RGB) {
                FORMAT = gl.RGB;
            } else { //TextureFormat.RGBA
                FORMAT = gl.RGBA;
            }

            if (wrap === TextureWrap.Clamp) {
                WRAP = gl.CLAMP_TO_EDGE;
            } else { //TextureWrap.Repeat
                WRAP = isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            }

            if (raw.height > maxTextureSize || raw.width > maxTextureSize) {
                Log.once("Renderer._createTexture: image height larger than machines max texture size (max = " + maxTextureSize + ")");
                raw = clampToMaxSize(raw, maxTextureSize);
            }

            gl.bindTexture(TEXTURE_2D, glTexture);

            gl.texImage2D(TEXTURE_2D, 0, FORMAT, FORMAT, gl.UNSIGNED_BYTE, raw);

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);

            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_MAG_FILTER, MAG_FILTER);
            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_MIN_FILTER, MIN_FILTER);

            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAP);
            gl.texParameteri(TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAP);

            if (TFA) gl.texParameterf(TEXTURE_2D, TFA.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
            if (isPOT) gl.generateMipmap(TEXTURE_2D);

            gl.bindTexture(TEXTURE_2D, null);

            texture.needsUpdate = false;

            return glTexture;
        };


        Renderer.prototype._initCubeTexture = function(cubeTexture) {
            if (!cubeTexture || cubeTexture.raw.length === 6) return this._whiteTexture;
            if (!cubeTexture.needsUpdate && cubeTexture._webgl) return cubeTexture._webgl;

            var gl = this.context,
                glTexture = cubeTexture._webgl || (cubeTexture._webgl = gl.createTexture()),
                raw = cubeTexture.raw,
                maxAnisotropy = this.maxAnisotropy,
                maxCubeTextureSize = this.maxCubeTextureSize,
                TFA = this.glExtensionTextureFilterAnisotropic,

                first = raw[0],
                isPOT = isPowerOfTwo(first.width) && isPowerOfTwo(first.height),
                anisotropy = clamp(cubeTexture.anisotropy || 1, 1, maxAnisotropy),

                TEXTURE_CUBE_MAP = gl.TEXTURE_CUBE_MAP,
                TEXTURE_CUBE_MAP_POSITIVE_X = gl.TEXTURE_CUBE_MAP_POSITIVE_X,
                filter = cubeTexture.filter,
                format = cubeTexture.format,
                wrap = cubeTexture.wrap,
                WRAP, MAG_FILTER, MIN_FILTER, FORMAT,
                current, i;

            if (filter === FilterMode.None) {
                MAG_FILTER = gl.NEAREST;
                if (isPOT) {
                    MIN_FILTER = gl.LINEAR_MIPMAP_NEAREST;
                } else {
                    MIN_FILTER = gl.NEAREST;
                }
            } else { //FilterMode.Linear
                MAG_FILTER = gl.LINEAR;
                if (isPOT) {
                    MIN_FILTER = gl.LINEAR_MIPMAP_LINEAR;
                } else {
                    MIN_FILTER = gl.LINEAR;
                }
            }

            if (format === TextureFormat.RGB) {
                FORMAT = gl.RGB;
            } else { //TextureFormat.RGBA
                FORMAT = gl.RGBA;
            }

            if (wrap === TextureWrap.Clamp) {
                WRAP = gl.CLAMP_TO_EDGE;
            } else { //TextureWrap.Repeat
                WRAP = isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            }

            gl.bindTexture(TEXTURE_CUBE_MAP, glTexture);

            for (i = 0; i < 6; i++) {
                current = raw[i];
                if (ficurrentrst.height > maxCubeTextureSize || current.width > maxCubeTextureSize) {
                    Log.once("Renderer._initCubeTexture: image height larger than machines max cube texture size (max = " + maxCubeTextureSize + ")");
                    current = clampToMaxSize(current, maxCubeTextureSize);
                }

                gl.texImage2D(TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, FORMAT, FORMAT, gl.UNSIGNED_BYTE, current);
            }

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, cubeTexture.flipY);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, cubeTexture.premultiplyAlpha);

            gl.texParameteri(TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, MAG_FILTER);
            gl.texParameteri(TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, MIN_FILTER);

            gl.texParameteri(TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, WRAP);
            gl.texParameteri(TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, WRAP);

            if (TFA) gl.texParameterf(TEXTURE_CUBE_MAP, TFA.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
            if (isPOT) gl.generateMipmap(TEXTURE_CUBE_MAP);

            gl.bindTexture(TEXTURE_CUBE_MAP, null);

            cubeTexture.needsUpdate = false;

            return glTexture;
        };


        function clampToMaxSize(image, maxSize) {
            var maxDim = 1 / max(image.width, image.height),
                newWidth = floor(image.width * maxSize * maxDim),
                newHeight = floor(image.height * maxSize * maxDim),
                canvas = document.createElement("canvas"),
                ctx = canvas.getContext("2d");

            canvas.width = newWidth;
            canvas.height = newHeight;
            ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, newWidth, newHeight);

            return canvas;
        }


        Renderer.prototype._initMaterial = function(material, mesh, lights) {
            if (!material.needsUpdate && material._webgl) return material._webgl;

            var shader = material.shader,
                uniforms = material.uniforms,
                standardDerivatives = !! this.glExtensionStandardDerivatives,
                parameters = {};

            parameters.shading = material.shading;
            parameters.doubleSided = material.side === Side.Both;
            parameters.flipSided = material.side === Side.Back;

            parameters.useLights = shader.lights;
            parameters.vertexLit = shader.vertexLit;
            parameters.useShadows = shader.shadows;
            parameters.useFog = shader.fog;

            parameters.useDiffuseMap = !! uniforms.diffuseMap;
            parameters.useSpecularMap = !! uniforms.specularMap;
            parameters.useEmissiveMap = !! uniforms.emissiveMap;
            parameters.useBumpMap = standardDerivatives && !! uniforms.bumpMap;
            parameters.useNormalMap = standardDerivatives && !! uniforms.normalMap;
            parameters.useEnvMap = !! uniforms.envMap;
            parameters.useMap = (
                parameters.useDiffuseMap ||
                parameters.useSpecularMap ||
                parameters.useEmissiveMap ||
                parameters.useBumpMap ||
                parameters.useNormalMap ||
                parameters.useEnvMap
            );

            parameters.positions = mesh.vertices.length > 0;
            parameters.normals = mesh.normals.length > 0;
            parameters.tangents = (parameters.useNormalMap) && mesh.tangents.length > 0;
            parameters.uvs = mesh.uvs.length > 0;
            parameters.colors = mesh.colors.length > 0;

            parameters.standardDerivatives = standardDerivatives && shader.standardDerivatives;
            parameters.useBones = mesh.useBones && mesh.bones.length > 0;

            allocateLights(lights, parameters);

            material._webgl = this._initProgram(shader.vertex, shader.fragment, parameters);
            material.needsUpdate = false;

            return material._webgl;
        };


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
                if (!light.visible) continue;
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


        var MAIN_SPLITER = /void[\s]+main([\s]+)?(\((void)?\))([\s]+)?{/;
        Renderer.prototype._initProgram = function(vertexShader, fragmentShader, parameters) {
            var gl = this.context,
                chunks = [],
                programs = this._programs,
                key, program, programInfo, code, i;

            chunks.push(fragmentShader, vertexShader);
            for (key in parameters) chunks.push(key, parameters[key]);

            code = chunks.join();

            for (i = programs.length; i--;) {
                programInfo = programs[i];

                if (programInfo.code === code) {
                    programInfo.used++;
                    return programInfo.program;
                }
            }

            var precision = this.precision,

                standardDerivatives = parameters.standardDerivatives,
                useBones = parameters.useBones,
                useLights = parameters.useLights,
                vertexLit = parameters.vertexLit,
                useShadows = parameters.useShadows,
                useFog = parameters.useFog,

                prefixVertex = [
                    "precision " + precision + " float;",
                    "precision " + precision + " int;",

                    useLights ? "#define USE_LIGHTS" : "",

                    useLights ? "#define MAX_DIR_LIGHTS " + parameters.maxDirectionalLights : "",
                    useLights ? "#define MAX_POINT_LIGHTS " + parameters.maxPointLights : "",
                    useLights ? "#define MAX_SPOT_LIGHTS " + parameters.maxSpotLights : "",
                    useLights ? "#define MAX_HEMI_LIGHTS " + parameters.maxHemiLights : "",

                    parameters.doubleSided ? "#define DOUBLE_SIDED" : "",
                    parameters.flipSided ? "#define FLIP_SIDED" : "",

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

                    useBones ? "attribute int boneIndex;" : "",
                    useBones ? "attribute vec3 boneWeights;" : "",
                    useBones ? "uniform mat4 bones[" + parameters.bones + "];" : ""
                ].join("\n"),

                prefixFragment = [
                    "precision " + precision + " float;",
                    "precision " + precision + " int;",

                    standardDerivatives ? "#extension GL_OES_standard_derivatives : enable" : "",

                    "uniform mat4 viewMatrix;",
                    "uniform vec3 cameraPosition;"
                ].join("\n"),

                glVertexShader = prefixVertex + "\n" + vertexShader,
                glFragmentShader = prefixFragment + "\n" + fragmentShader,

                vertexSplit = glVertexShader.split(MAIN_SPLITER),
                fragmentSplit = glFragmentShader.split(MAIN_SPLITER),
                main = "void main(void) {\n",
                parsVertex = vertexSplit[0],
                mainVertex = vertexSplit[5],
                parsFragment = fragmentSplit[0],
                mainFragment = fragmentSplit[5];

            if (standardDerivatives) {
                if (parameters.useNormalMap) parsFragment += ShaderChunks.perturbNormal2Arb;
                if (parameters.useBumpMap) parsFragment += ShaderChunks.dHdxy_fwd + ShaderChunks.perturbNormalArb;
            }
            if (useLights) {
                if (vertexLit) {
                    parsVertex += ShaderChunks.lights_pars_vertexlit;
                    mainVertex = ShaderChunks.lights_vertexlit + mainVertex;

                    parsFragment += ShaderChunks.lights_pars_vertexlit_fragment;
                }
                mainVertex = ShaderChunks.worldpos_vertex + mainVertex;
            }
            if (parameters.normals) mainVertex = ShaderChunks.defaultnormal_vertex + mainVertex;
            mainVertex = ShaderChunks.default_vertex + mainVertex;

            glVertexShader = parsVertex + main + mainVertex;
            glFragmentShader = parsFragment + main + mainFragment;

            program = createProgram(gl, glVertexShader, glFragmentShader);
            program.uniforms = {};
            program.attributes = {};
            program.customUniforms = [];
            program.customAttributes = [];
            program.parameters = parameters;

            getUniformsAttributes(vertexShader, fragmentShader, program.customAttributes, program.customUniforms);
            parseUniformsAttributes(gl, program, glVertexShader, glFragmentShader, program.attributes, program.uniforms);

            programs.push({
                used: 1,
                code: code,
                program: program
            });

            return program;
        };


        Renderer.prototype._bindMesh = function(mesh, material) {
            if (this._lastBuffer === mesh._webgl) return;
            var gl = this.context,
                webgl = mesh._webgl,
                ARRAY_BUFFER = gl.ARRAY_BUFFER,
                FLOAT = gl.FLOAT,
                attributes = material._webgl.attributes;

            if (webgl.vertexBuffer && attributes.position > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.vertexBuffer);
                gl.enableVertexAttribArray(attributes.position);
                gl.vertexAttribPointer(attributes.position, 3, FLOAT, false, 0, 0);
            }
            if (webgl.normalBuffer && attributes.normal > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.normalBuffer);
                gl.enableVertexAttribArray(attributes.normal);
                gl.vertexAttribPointer(attributes.normal, 3, FLOAT, false, 0, 0);
            }
            if (webgl.tangentBuffer && attributes.tangent > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.tangentBuffer);
                gl.enableVertexAttribArray(attributes.tangent);
                gl.vertexAttribPointer(attributes.tangent, 4, FLOAT, false, 0, 0);
            }
            if (webgl.colorBuffer && attributes.color > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.colorBuffer);
                gl.enableVertexAttribArray(attributes.color);
                gl.vertexAttribPointer(attributes.color, 3, FLOAT, false, 0, 0);
            }
            if (webgl.uvBuffer && attributes.uv > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.uvBuffer);
                gl.enableVertexAttribArray(attributes.uv);
                gl.vertexAttribPointer(attributes.uv, 2, FLOAT, false, 0, 0);
            }
            if (webgl.boneIndexBuffer && attributes.boneIndex > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.boneIndexBuffer);
                gl.enableVertexAttribArray(attributes.boneIndex);
                gl.vertexAttribPointer(attributes.boneIndex, 1, FLOAT, false, 0, 0);
            }
            if (webgl.boneWeightBuffer && attributes.boneWeight > -1) {
                gl.bindBuffer(ARRAY_BUFFER, webgl.boneWeightBuffer);
                gl.enableVertexAttribArray(attributes.boneWeight);
                gl.vertexAttribPointer(attributes.boneWeight, 3, FLOAT, false, 0, 0);
            }

            if (material.wireframe) {
                if (webgl.lineBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, webgl.lineBuffer);
            } else {
                if (webgl.indexBuffer) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, webgl.indexBuffer);
            }

            this._lastBuffer = mesh._webgl;
        };


        Renderer.prototype._bindTexture = function(texture, uniform) {
            var gl = this.context,
                glTexture = this._initTexture(texture),
                index;

            if (this._textureIndex < this.maxTextures) {
                if (this._lastTexture !== glTexture) {
                    index = this._textureIndex++;

                    gl.activeTexture(gl.TEXTURE0 + index);
                    gl.bindTexture(gl.TEXTURE_2D, glTexture);
                    gl.uniform1i(uniform, index);

                    this._lastTexture = glTexture;
                }
            } else {
                Log.once("Renderer._bindTexture: exceeded max number of textures for this machine (max = " + this.maxTextures + ")");
            }
        };


        var MAT4 = new Mat4,
            VEC3 = new Vec3,
            VEC3_2 = new Vec3,
            COLOR = new Color;
        Renderer.prototype._bindMaterial = function(material, transform, camera, lights, ambient) {
            var gl = this.context,
                program = material._webgl,
                parameters = program.parameters,
                uniforms = program.uniforms,
                index = 0,
                i, length;

            if (this._lastProgram !== program) {
                gl.useProgram(program);
                this._lastProgram = program;
            }

            if (uniforms.modelMatrix) {
                gl.uniformMatrix4fv(uniforms.modelMatrix.location, false, transform.matrixWorld.elements);
                index += 16;
            }
            if (uniforms.modelViewMatrix) {
                gl.uniformMatrix4fv(uniforms.modelViewMatrix.location, false, transform.modelView.elements);
                index += 16;
            }
            if (uniforms.projectionMatrix) {
                gl.uniformMatrix4fv(uniforms.projectionMatrix.location, false, camera.projection.elements);
                index += 16;
            }
            if (uniforms.viewMatrix) {
                gl.uniformMatrix4fv(uniforms.viewMatrix.location, false, camera.view.elements);
                index += 16;
            }
            if (uniforms.normalMatrix) {
                gl.uniformMatrix3fv(uniforms.normalMatrix.location, false, transform.normalMatrix.elements);
                index += 9;
            }
            if (uniforms.cameraPosition) {
                VEC3.positionFromMat4(camera.transform.matrixWorld);
                gl.uniform3f(uniforms.cameraPosition.location, VEC3.x, VEC3.y, VEC3.z);
                index += 3;
            }
            if (uniforms.ambient) {
                gl.uniform3f(uniforms.ambient.location, ambient.r, ambient.g, ambient.b);
                index += 3;
            }

            if (parameters.useLights && (length = lights.length)) {
                var maxPointLights = parameters.maxPointLights,
                    maxDirectionalLights = parameters.maxDirectionalLights,
                    maxSpotLights = parameters.maxSpotLights,
                    maxHemiLights = parameters.maxHemiLights,

                    pointLights = 0,
                    pointLightColor = uniforms.pointLightColor ? uniforms.pointLightColor.location : undefined,
                    pointLightPosition = uniforms.pointLightPosition ? uniforms.pointLightPosition.location : undefined,
                    pointLightDistance = uniforms.pointLightDistance ? uniforms.pointLightDistance.location : undefined,

                    directionalLights = 0,
                    directionalLightColor = uniforms.directionalLightColor ? uniforms.directionalLightColor.location : undefined,
                    directionalLightDirection = uniforms.directionalLightDirection ? uniforms.directionalLightDirection.location : undefined,

                    spotLights = 0,
                    spotLightColor = uniforms.spotLightColor ? uniforms.spotLightColor.location : undefined,
                    spotLightPosition = uniforms.spotLightPosition ? uniforms.spotLightPosition.location : undefined,
                    spotLightDirection = uniforms.spotLightDirection ? uniforms.spotLightDirection.location : undefined,
                    spotLightDistance = uniforms.spotLightDistance ? uniforms.spotLightDistance.location : undefined,
                    spotLightAngleCos = uniforms.spotLightAngleCos ? uniforms.spotLightAngleCos.location : undefined,
                    spotLightExponent = uniforms.spotLightExponent ? uniforms.spotLightExponent.location : undefined,

                    hemiLights = 0,
                    hemiLightColor = uniforms.hemiLightColor ? uniforms.hemiLightColor.location : undefined,
                    hemiLightDirection = uniforms.hemiLightDirection ? uniforms.hemiLightDirection.location : undefined,

                    light, type;

                for (i = 0; i < length; i++) {
                    light = lights[i];
                    if (!light.visible) continue;

                    type = light.type;
                    COLOR.copy(light.color).smul(light.energy);

                    if (pointLightColor.length && type === LightType.Point) {
                        if (pointLights >= maxPointLights) continue;

                        VEC3.positionFromMat4(light.transform.matrixWorld);

                        gl.uniform3f(pointLightColor[pointLights], COLOR.r, COLOR.g, COLOR.b);
                        gl.uniform3f(pointLightPosition[pointLights], VEC3.x, VEC3.y, VEC3.z);
                        gl.uniform1f(pointLightDistance[pointLights], light.distance);
                        pointLights++;
                    } else if (directionalLightColor.length && type === LightType.Directional) {
                        if (directionalLights >= maxDirectionalLights) continue;

                        VEC3.positionFromMat4(light.transform.matrixWorld).sub(light.target).normalize();
                        if (VEC3.lengthSq() === 0) continue;

                        gl.uniform3f(directionalLightColor[directionalLights], COLOR.r, COLOR.g, COLOR.b);
                        gl.uniform3f(directionalLightDirection[directionalLights], VEC3.x, VEC3.y, VEC3.z);
                        directionalLights++;

                    } else if (spotLightColor.length && type === LightType.Spot) {
                        if (spotLights >= maxSpotLights) continue;

                        VEC3.positionFromMat4(light.transform.matrixWorld);
                        if (VEC3.lengthSq() === 0) continue;

                        VEC3_2.copy(VEC3).sub(light.target).normalize();
                        if (VEC3_2.lengthSq() === 0) continue;

                        gl.uniform3f(spotLightColor[spotLights], COLOR.r, COLOR.g, COLOR.b);
                        gl.uniform3f(spotLightPosition[spotLights], VEC3.x, VEC3.y, VEC3.z);
                        gl.uniform3f(spotLightDirection[spotLights], VEC3_2.x, VEC3_2.y, VEC3_2.z);
                        gl.uniform1f(spotLightDistance[spotLights], light.distance);
                        gl.uniform1f(spotLightAngleCos[spotLights], light._angleCos);
                        gl.uniform1f(spotLightExponent[spotLights], light.exponent);
                        spotLights++;

                    } else if (hemiLightColor.length && type === LightType.Hemi) {
                        if (hemiLights >= maxHemiLights) continue;

                        VEC3.positionFromMat4(light.transform.matrixWorld).sub(light.target).normalize();
                        if (VEC3.lengthSq() === 0) continue;

                        gl.uniform3f(hemiLightColor[hemiLights], COLOR.r, COLOR.g, COLOR.b);
                        gl.uniform3f(hemiLightDirection[hemiLights], VEC3.x, VEC3.y, VEC3.z);
                        hemiLights++;
                    }
                }

                index += pointLights * 8 + directionalLights * 7 + spotLights * 13 + hemiLights * 7;
            }

            index = this._bindCustomUniforms(program.customUniforms, uniforms, material.uniforms, index);
            this._textureIndex = 0;

            this._uniformsIndex = index;
        };


        Renderer.prototype._bindCustomUniforms = function(customUniforms, uniforms, materialUniforms, index) {
            var gl = this.context,
                i = customUniforms.length,
                customUniform, uniformValue, location, name, type, value;

            while (i--) {
                customUniform = customUniforms[i];
                name = customUniform.name;

                uniformValue = uniforms[name];
                value = materialUniforms[name];

                if (!uniformValue) continue;
                if (!value && customUniform.type !== "sampler2D") throw "WebGLRenderer bindShader: material has no uniform named " + name;

                if (uniformValue.isArray) {
                    location = uniformValue.location;
                    type = uniformValue.type;

                    for (i = location.length; i--;) index += bindUniform(this, gl, type, location[i], value[i]);
                } else {
                    index += bindUniform(this, gl, uniformValue.type, uniformValue.location, value);
                }
            }

            return index;
        }


        function bindUniform(renderer, gl, type, location, value, index) {

            if (type === "int") {
                gl.uniform1i(location, value);
                return 1;
            } else if (type === "float") {
                gl.uniform1f(location, value);
                return 1;
            } else if (type === "vec2") {
                gl.uniform2f(location, value.x, value.y);
                return 2;
            } else if (type === "vec3") {
                gl.uniform3f(location, value.x, value.y, value.z);
                return 3;
            } else if (type === "vec4") {
                gl.uniform3f(location, value.x, value.y, value.z, value.w);
                return 4;
            } else if (type === "mat2") {
                gl.uniformMatrix2fv(location, false, value.elements);
                return 4;
            } else if (type === "mat3") {
                gl.uniformMatrix3fv(location, false, value.elements);
                return 9;
            } else if (type === "mat4") {
                gl.uniformMatrix4fv(location, false, value.elements);
                return 16;
            } else if (type === "sampler2D") {
                renderer._bindTexture(value, location);
                return 1;
            }

            return index;
        }


        Renderer.prototype.preRender = function(gui, scene, camera) {
            if (!this._context) return;
            var gl = this.context,
                clearColor = this._clearColor,
                background = camera.background;

            if (clearColor.r !== background.r || clearColor.g !== background.g || clearColor.b !== background.b) {
                clearColor.copy(background);
                gl.clearColor(background.r, background.g, background.b, 1);
                if (!this.autoClear) this.clearCanvas(this.autoClearColor, this.autoClearDepth, this.autoClearStencil);
            }
            if (this._lastCamera !== camera) {
                var self = this,
                    canvas = this.canvas,
                    w = canvas.pixelWidth,
                    h = canvas.pixelHeight;

                camera.set(w, h);
                this.setViewport(0, 0, w, h);

                if (this._lastResizeFn) canvas.off("resize", this._lastResizeFn);

                this._lastResizeFn = function() {
                    var w = this.pixelWidth,
                        h = this.pixelHeight;

                    camera.set(w, h);
                    self.setViewport(0, 0, w, h);
                };

                canvas.on("resize", this._lastResizeFn);
                this._lastCamera = camera;
            }
            if (scene && this._lastScene !== scene) {

                this._lastScene = scene;
            }

            if (this.autoClear) this.clearCanvas(this.autoClearColor, this.autoClearDepth, this.autoClearStencil);
        };


        Renderer.prototype.renderGUI = function(gui, camera) {
            if (!this._context) return;
            var gl = this.context,
                components = gui.components,
                transform,
                i;

        };


        /**
         * @method render
         * @memberof Renderer
         * @brief renderers scene from camera's perspective
         * @param Scene scene
         * @param Camera camera
         */
        Renderer.prototype.render = function(scene, camera) {
            if (!this._context) return;
            var gl = this.context,
                components = scene.components,
                ambient = scene.world.ambient,
                lights = components.Light || EMPTY_ARRAY,
                meshFilters = components.MeshFilter || EMPTY_ARRAY,
                meshFilter, transform,
                i;

            for (i = meshFilters.length; i--;) {
                meshFilter = meshFilters[i];
                transform = meshFilter.transform;

                if (!transform) continue;

                transform.updateMatrices(camera.view);
                this.renderMeshFilter(camera, lights, ambient, transform, meshFilter);
            }
        };


        Renderer.prototype.renderMeshFilter = function(camera, lights, ambient, transform, meshFilter) {
            var gl = this.context,

                mesh = meshFilter.mesh,
                material = meshFilter.material,

                buffers = this._initMeshBuffers(mesh),
                program = this._initMaterial(material, mesh, lights),

                lineWidth = this._lastLineWidth,
                blending = this._lastBlending;

            this._bindMaterial(material, transform, camera, lights, ambient);
            this._bindMesh(mesh, material);

            this.setBlending(material.blending);

            if (material.wireframe) {
                this.setLineWidth(material.wireframeLineWidth);
                gl.drawElements(gl.LINES, buffers.lineCount, gl.UNSIGNED_SHORT, 0);
                this.setLineWidth(lineWidth);
            } else {
                gl.drawElements(gl.TRIANGLES, buffers.indexCount, gl.UNSIGNED_SHORT, 0);
            }

            this.setBlending(blending);
            this._uniformsIndex = 0;
        };


        Renderer.prototype._handleWebGLContextLost = function(e) {
            e.preventDefault();
            Log.warn("Renderer: webgl context was lost");

            this._context = false;
            this.emit("webglcontextlost", e);
        };


        Renderer.prototype._handleWebGLContextRestored = function(e) {
            Log.log("Renderer: webgl context was restored");

            this.initGL();
            this.setDefaultGLState();

            this._context = true;
            this.emit("webglcontextrestored", e);
        };


        return Renderer;
    }
);
