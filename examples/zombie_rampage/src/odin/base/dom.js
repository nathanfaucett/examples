if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define(
    function() {
        "use strict";


        var SPLITER = /[ ,]+/,

            WEBGL_NAMES = ["webgl", "webkit-3d", "moz-webgl", "experimental-webgl", "3d"],
            WEBGL_ATTRIBUTES = {
                alpha: true,
                antialias: true,
                depth: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                stencil: true
            };


        function Dom() {}


        Dom.prototype.addEvent = function(obj, name, callback, ctx) {
            var names = name.split(SPLITER),
                i,
                scope = ctx || obj,
                afn = function(e) {
                    callback.call(scope, e || window.event);
                };

            for (i = names.length; i--;) {
                name = names[i];

                if (obj.attachEvent) {
                    obj.attachEvent("on" + name, afn);
                } else {
                    obj.addEventListener(name, afn, false);
                }
            }
        };


        Dom.prototype.removeEvent = function(obj, name, callback, ctx) {
            var names = name.split(SPLITER),
                i, il,
                scope = ctx || obj,
                afn = function(e) {
                    if (callback) callback.call(scope, e || window.event);
                };

            for (i = 0, il = names.length; i < il; i++) {
                name = names[i];

                if (obj.detachEvent) {
                    obj.detachEvent("on" + name, afn);
                } else {
                    obj.removeEventListener(name, afn, false);
                }
            }
        };


        Dom.prototype.addMeta = function(id, name, content) {
            var meta = document.createElement("meta"),
                head = document.head;

            if (id) meta.id = id;
            if (name) meta.name = name;
            if (content) meta.content = content;

            head.insertBefore(meta, head.firstChild);
        };


        Dom.prototype.getWebGLContext = function(canvas, attributes) {
            var key, gl, i;

            attributes || (attributes = {});
            for (key in WEBGL_ATTRIBUTES) {
                if (attributes[key] == undefined) attributes[key] = WEBGL_ATTRIBUTES[key];
            }

            for (i = WEBGL_NAMES.length; i--;) {

                try {
                    gl = canvas.getContext(WEBGL_NAMES[i], attributes);
                } catch (err) {
                    console.error("Dom.getWebGLContext: could not get a WebGL Context " + (err.message || ""));
                }
                if (gl) break;
            }

            return gl;
        };


        var createShader = Dom.prototype.createShader = function(gl, source, type) {
            var shader = gl.createShader(type);

            gl.shaderSource(shader, source);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error("Dom.createShader: problem compiling shader " + gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return undefined;
            }

            return shader;
        };


        Dom.prototype.createProgram = function(gl, vertex, fragment) {
            var program = gl.createProgram(),
                shader;

            shader = createShader(gl, vertex, gl.VERTEX_SHADER);
            gl.attachShader(program, shader);
            gl.deleteShader(shader);

            shader = createShader(gl, fragment, gl.FRAGMENT_SHADER);
            gl.attachShader(program, shader);
            gl.deleteShader(shader);

            gl.linkProgram(program);
            gl.validateProgram(program);
            gl.useProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error("Dom.createProgram: problem compiling Program " + gl.getProgramInfoLog(program));
                gl.deleteProgram(program);
                return undefined;
            }

            return program;
        };


        return new Dom;
    }
);
