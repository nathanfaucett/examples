if (typeof define !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/class",
        "odin/base/object_pool"
    ],
    function(Class, ObjectPool) {
        "use strict";


        function Prefab(object) {

            Class.call(this);

            this.object = object.toJSON();
            this.objectPool = new ObjectPool(object.constructor);
        }

        Class.extend(Prefab);


        Prefab.prototype.create = function() {
            var object = this.objectPool.create();

            object.clear();

            object.fromJSON(this.object);
            object.on("remove", onRemove, this);

            return object;
        };


        Prefab.prototype.toJSON = function(json) {
            json = Class.prototype.toJSON.call(this, json);

            json.object = this.object;

            return json;
        };


        Prefab.prototype.fromJSON = function(json) {
            Class.prototype.fromJSON.call(this, json);

            this.object = json.object;
            this.objectPool = new ObjectPool(Class._classes[json.object._className]);

            return this;
        };


        function onRemove(object) {

            this.objectPool.removeObject(object);
        };


        return Prefab;
    }
);
