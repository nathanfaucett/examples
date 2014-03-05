if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/math/mathf",
        "odin/math/vec3",
        "odin/math/quat",
        "odin/math/mat3",
        "odin/math/mat4",
        "odin/core/components/component",
        "odin/core/game/log"
    ],
    function(Mathf, Vec3, Quat, Mat3, Mat4, Component, Log) {
        "use strict";


        var EPSILON = Mathf.EPSILON;


        function Transform(opts) {
            opts || (opts = {});
            opts.sync = opts.sync != undefined ? opts.sync : true;

            Component.call(this, "Transform", opts);

            this.root = this;
            this.depth = 0;

            this.parent = undefined;
            this.children = [];

            this.position = opts.position != undefined ? opts.position : new Vec3;
            this.rotation = opts.rotation != undefined ? opts.rotation : new Quat;
            this.scale = opts.scale != undefined ? opts.scale : new Vec3(1, 1, 1);

            this.matrix = new Mat4;
            this.matrixWorld = new Mat4;

            this.modelView = new Mat4;
            this.normalMatrix = new Mat3;
            this._matricesViewNeedsUpdate = false;
        }

        Component.extend(Transform);


        Transform.prototype.copy = function(other) {
            var children = other.children,
                i;

            this.position.copy(other.position);
            this.scale.copy(other.scale);
            this.rotation.copy(other.rotation);

            for (i = children.length; i--;) this.addChild(children[i].gameObject.clone().transform);
            if (other.parent) other.parent.addChild(this);

            return this;
        };


        Transform.prototype.clear = function() {
            Component.prototype.clear.call(this);
            var children = this.children,
                i;

            for (i = children.length; i--;) this.removeChild(children[i]);

            this.position.set(0, 0, 0);
            this.scale.set(1, 1, 1);
            this.rotation.set(0, 0, 0, 1);

            this.root = this;
            this.depth = 0;

            return this;
        };


        Transform.prototype.translate = function() {
            var vec = new Vec3;

            return function(translation, relativeTo) {
                vec.copy(translation);

                if (relativeTo instanceof Transform) {
                    vec.transformQuat(relativeTo.rotation);
                } else if (relativeTo instanceof Quat) {
                    vec.transformQuat(relativeTo);
                }

                this.position.add(vec);

                return this;
            };
        }();


        Transform.prototype.rotate = function() {
            var vec = new Vec3;

            return function(rotation, relativeTo) {
                vec.copy(rotation);

                if (relativeTo instanceof Transform) {
                    vec.transformQuat(relativeTo.rotation);
                } else if (relativeTo instanceof Quat) {
                    vec.transformQuat(relativeTo);
                }

                this.rotation.rotate(vec.x, vec.y, vec.z);

                return this;
            };
        }();


        Transform.prototype.lookAt = function() {
            var mat = new Mat4,
                vec = new Vec3,
                dup = new Vec3(0, 0, 1);

            return function(target, up) {
                up = up || dup;

                if (target instanceof Transform) {
                    vec.copy(target.position);
                } else {
                    vec.copy(target);
                }

                mat.lookAt(this.position, vec, up);
                this.rotation.fromMat4(mat);

                return this;
            };
        }();


        Transform.prototype.follow = function() {
            var target = new Vec3,
                position = new Vec3,
                delta = new Vec3;

            return function(transform, speed) {
                position.set(0, 0, 0).transformMat4(this.matrixWorld);
                target.set(0, 0, 0).transformMat4(transform.matrixWorld);

                delta.vsub(target, position);

                if (delta.lengthSq() > EPSILON) this.position.add(delta.smul(speed));

                return this;
            };
        }();


        Transform.prototype.addChild = function(child) {
            if (!(child instanceof Transform)) {
                Log.error("Transform.add: can\'t add passed argument, it is not an instance of Transform");
                return this;
            }
            var children = this.children,
                index = children.indexOf(child),
                root, depth;

            if (index === -1) {
                if (child.parent) child.parent.remove(child);

                child.parent = this;
                children.push(child);

                root = this;
                depth = 0;

                while (root.parent) {
                    root = root.parent;
                    depth++;
                }
                child.root = root;
                this.root = root;

                updateDepth(this, depth);
            } else {
                Log.error("Transform.add: child is not a member of this Transform");
            }

            return this;
        };


        Transform.prototype.addChildren = function() {

            for (var i = arguments.length; i--;) this.addChild(arguments[i]);
            return this;
        };


        Transform.prototype.removeChild = function(child) {
            var children = this.children,
                index = children.indexOf(child),
                root, depth;

            if (index !== -1) {
                child.parent = undefined;
                children.splice(index, 1);

                root = this;
                depth = 0;

                while (root.parent) {
                    root = root.parent;
                    depth++;
                }
                child.root = child;
                this.root = root;

                updateDepth(this, depth);
            } else {
                Log.error("Transform.remove: child is not a member of this Transform");
            }

            return this;
        };


        Transform.prototype.removeChildren = function() {

            for (var i = arguments.length; i--;) this.removeChild(arguments[i]);
            return this;
        };


        Transform.prototype.detachChildren = function() {
            var children = this.children,
                i;

            for (i = children.length; i--;) this.removeChild(children[i]);
            return this;
        };


        Transform.prototype.hasChild = function(child) {

            return !!~this.children.indexOf(child);
        };


        Transform.prototype.toWorld = function(v) {

            return v.transformMat4(this.matrixWorld);
        };


        Transform.prototype.toLocal = function() {
            var mat = new Mat4;

            return function(v) {

                return v.transformMat4(mat.inverseMat(this.matrixWorld));
            };
        }();


        Transform.prototype.update = function() {
            var matrix = this.matrix,
                parent = this.parent;

            matrix.compose(this.position, this.scale, this.rotation);

            if (parent) {
                this.matrixWorld.mmul(parent.matrixWorld, matrix);
            } else {
                this.matrixWorld.copy(matrix);
            }

            this._matricesViewNeedsUpdate = true;
        };


        Transform.prototype.updateMatrices = function(viewMatrix) {
            if (!this._matricesViewNeedsUpdate) return;

            this.modelView.mmul(viewMatrix, this.matrixWorld);
            this.normalMatrix.inverseMat4(this.modelView).transpose();
            this._matricesViewNeedsUpdate = false;
        };


        Transform.prototype.sort = function(a, b) {

            return b.depth - a.depth;
        };


        Transform.prototype.toJSON = function(json) {
            json = Component.prototype.toJSON.call(this, json);
            var children = this.children,
                jsonChildren = json.children || (json.children = []),
                i = children.length;

            while (i--) jsonChildren[i] = children[i]._id;

            json.position = this.position.toJSON(json.position);
            json.scale = this.scale.toJSON(json.scale);
            json.rotation = this.rotation.toJSON(json.rotation);

            return json;
        };


        Transform.prototype.fromJSON = function(json) {
            Component.prototype.fromJSON.call(this, json);
            var children = json.children,
                i = children.length,
                child;

            if (this.gameObject && this.gameObject.scene) {
                while (i--) {
                    child = this.gameObject.scene.findComponentByJSONId(children[i]);

                    if (!this.hasChild(child)) {
                        this.addChild(child);
                    }
                }
            } else {
                this.once("init", function() {
                    while (i--) {
                        child = this.gameObject.scene.findComponentByJSONId(children[i]);

                        if (!this.hasChild(child)) {
                            this.addChild(child);
                        }
                    }
                });
            }

            this.position.fromJSON(json.position);
            this.scale.fromJSON(json.scale);
            this.rotation.fromJSON(json.rotation);

            return this;
        };


        function updateDepth(transform, depth) {
            var children = transform.children,
                i;

            transform.depth = depth;

            for (i = children.length; i--;) updateDepth(children[i], depth + 1);
        }


        return Transform;
    }
);
