if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/core/assets/shaders/shader",
    ],
    function(Shader) {
        "use strict";


        function ParticleUnlit() {

            Shader.call(this, {
                name: "shader_particle_unlit",

                vertex: [
                    "void main() {",
                    "	gl_PointSize = 10.0;",
                    "	gl_Position = projectionMatrix * mvPosition;",
                    "}"
                ].join("\n"),

                fragment: [
                    "void main() {",
                    "	gl_FragColor = vec4(1.0);",
                    "}"
                ].join("\n")
            });
        }

        Shader.extend(ParticleUnlit);


        return ParticleUnlit;
    }
);
