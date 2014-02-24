if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/math/mathf",
        "odin/math/vec2",
        "odin/math/mat32",
        "odin/math/mat4",
        "odin/core/components/component",
        "odin/core/game/config",
        "odin/core/game/log"
    ],
    function(Mathf, Vec2, Mat32, Mat4, Component, Config, Log) {
        "use strict";


        var EPSILON = Mathf.EPSILON;


        function Transform2D(opts) {
            opts || (opts = {});
            opts.sync = opts.sync != undefined ? opts.sync : true;

            Component.call(this, "Transform2D", opts);

            this.root = this;
            this.depth = 0;

            this.parent = undefined;
            this.children = [];

            this.position = opts.position != undefined ? opts.position : new Vec2;
            this.rotation = opts.rotation != undefined ? opts.rotation : 0;
            this.scale = opts.scale != undefined ? opts.scale : new Vec2(1, 1);

            this.matrix = new Mat32;
            this.matrixWorld = new Mat32;
            this._matrixWorldMat4 = new Mat4;

            this.modelView = new Mat32;
            this._modelViewMat4 = new Mat4;

            this._modelViewNeedsUpdate = false;
            this._modelViewMat4NeedsUpdate = false;
        }

        Component.extend(Transform2D);


        Transform2D.prototype.copy = function(other) {
            var children = other.children,
                i;

            this.position.copy(other.position);
            this.scale.copy(other.scale);
            this.rotation = other.rotation;

            for (i = children.length; i--;) this.addChild(children[i].gameObject.clone().transform);
            if (other.parent) other.parent.addChild(this);

            return this;
        };


        Transform2D.prototype.clear = function() {
            Component.prototype.clear.call(this);
            var children = this.children,
                i;

            for (i = children.length; i--;) this.removeChild(children[i]);

            this.position.set(0, 0);
            this.scale.set(1, 1);
            this.rotation = 0;

            this.root = this;
            this.depth = 0;

            return this;
        };


        Transform2D.prototype.translate = function() {
            var vec = new Vec2;

            return function(translation, relativeTo) {
                vec.copy(translation);

                if (relativeTo instanceof Transform2D) {
                    vec.transformAngle(relativeTo.rotation);
                } else if (relativeTo) {
                    vec.transformAngle(relativeTo);
                }

                this.position.add(vec);

                return this;
            };
        }();


        Transform2D.prototype.rotate = function(rotation, relativeTo) {

            if (relativeTo instanceof Transform2D) {
                rotation += relativeTo.rotation;
            } else if (relativeTo) {
                rotation += relativeTo;
            }

            this.rotation += rotation;

            return this;
        };


        Transform2D.prototype.lookAt = function() {
            var mat = new Mat32,
                vec = new Vec2;

            return function(target, up) {
                up = up || dup;

                if (target instanceof Transform2D) {
                    vec.copy(target.position);
                } else {
                    vec.copy(target);
                }

                mat.lookAt(this.position, vec);
                this.rotation = mat.getRotation();

                return this;
            };
        }();


        Transform2D.prototype.follow = function() {
            var target = new Vec2,
                position = new Vec2,
                delta = new Vec2;

            return function(transform, speed) {
                position.set(0, 0).transformMat32(this.matrixWorld);
                target.set(0, 0).transformMat32(transform.matrixWorld);

                delta.vsub(target, position);

                if (delta.lengthSq() > EPSILON) this.position.add(delta.smul(speed));

                return this;
            };
        }();


        Transform2D.prototype.addChild = function(child) {
            if (!(child instanceof Transform2D)) {
                Log.error("Transform2D.add: can\'t add passed argument, it is not an instance of Transform2D");
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
                Log.error("Transform2D.add: child is not a member of this Transform2D");
            }

            return this;
        };


        Transform2D.prototype.addChildren = function() {

            for (var i = arguments.length; i--;) this.addChild(arguments[i]);
            return this;
        };


        Transform2D.prototype.removeChild = function(child) {
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
                Log.error("Transform2D.remove: child is not a member of this Transform2D");
            }

            return this;
        };


        Transform2D.prototype.removeChildren = function() {

            for (var i = arguments.length; i--;) this.removeChild(arguments[i]);
            return this;
        };


        Transform2D.prototype.detachChildren = function() {
            var children = this.children,
                i;

            for (i = children.length; i--;) this.removeChild(children[i]);
            return this;
        };


        Transform2D.prototype.toWorld = function(v) {

            return v.transformMat32(this.matrixWorld);
        };


        Transform2D.prototype.toLocal = function() {
            var mat = new Mat32;

            return function(v) {

                return v.transformMat32(mat.inverseMat(this.matrixWorld));
            };
        }();


        Transform2D.prototype.update = function() {
            var matrix = this.matrix,
                parent = this.parent;

            matrix.compose(this.position, this.scale, this.rotation);

            if (parent) {
                this.matrixWorld.mmul(parent.matrixWorld, matrix);
            } else {
                this.matrixWorld.copy(matrix);
            }

            this._matrixWorldMat4.fromMat32(this.matrixWorld);

            this._modelViewNeedsUpdate = true;
            this._modelViewMat4NeedsUpdate = true;
        };


        Transform2D.prototype.updateModelViewMat32 = function(viewMatrix) {
            if (!this._modelViewNeedsUpdate) return;

            this.modelView.mmul(viewMatrix, this.matrixWorld);

            this._modelViewNeedsUpdate = false;
        };


        Transform2D.prototype.updateModelView = function(viewMatrix) {
            if (!this._modelViewMat4NeedsUpdate) return;

            this._modelViewMat4.mmul(viewMatrix, this._matrixWorldMat4);

            this._modelViewMat4NeedsUpdate = false;
        };


        Transform2D.prototype.sort = function(a, b) {

            return b.depth - a.depth;
        };


        Transform2D.prototype.toJSON = function(json) {
            json = Component.prototype.toJSON.call(this, json);

            json.position = this.position.toJSON(json.position);
            json.scale = this.scale.toJSON(json.scale);
            json.rotation = this.rotation

            return json;
        };


        Transform2D.prototype.fromJSON = function(json) {
            Component.prototype.fromJSON.call(this, json);

            this.position.fromJSON(json.position);
            this.scale.fromJSON(json.scale);
            this.rotation = json.rotation;

            return this;
        };


        function updateDepth(transform, depth) {
            var children = transform.children,
                i;

            transform.depth = depth;
            for (i = children.length; i--;) updateDepth(children[i], depth + 1);
        }


        return Transform2D;
    }
);
