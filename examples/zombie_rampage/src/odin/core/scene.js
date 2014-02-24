if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/class",
        "odin/core/components/transform",
        "odin/core/components/transform_2d",
        "odin/core/game_object",
        "odin/core/world/world",
        "odin/core/game/log"
    ],
    function(Class, Transform, Transform2D, GameObject, World, Log) {
        "use strict";


        var defineProperty = Object.defineProperty;

        /**
         * Scenes manage GameObjects and their Components
         * @class Odin.Scene
         * @extends Odin.Class
         * @param Object options
         */
        function Scene(opts) {
            opts || (opts = {});

            Class.call(this);

            this.game = undefined;

            this.name = opts.name != undefined ? opts.name : "Scene_" + this._id;

            this.world = undefined;

            this.gameObjects = [];
            this._gameObjectHash = {};
            this._gameObjectJSONHash = {};

            this.components = {};
            this._componentTypes = [];
            this._componentHash = {};
            this._componentJSONHash = {};

            this.setWorld(opts.world instanceof World ? opts.world : new World(opts.world));
            if (opts.gameObjects) this.addGameObjects.apply(this, opts.gameObjects);
        }

        Class.extend(Scene);


        Scene.prototype.copy = function(other) {
            var otherGameObjects = other.gameObjects,
                i;

            this.clear();
            this.name = other.name + "." + this._id;

            for (i = otherGameObjects.length; i--;) this.addGameObject(otherGameObjects[i].clone());

            return this;
        };


        Scene.prototype.init = function() {
            var types = this._componentTypes,
                gameObjects = this.gameObjects,
                components, component, i, j;

            this.world && this.world.init();

            for (i = types.length; i--;) {
                components = types[i];
                for (j = components.length; j--;) {
                    component = components[j];

                    component.emit("init");
                    component.init();
                }
            }

            for (i = gameObjects.length; i--;) gameObjects[i].emit("init");
        };


        Scene.prototype.update = function() {
            var types = this._componentTypes,
                gameObjects = this.gameObjects,
                components, i, j;

            this.world && this.world.update();

            for (i = types.length; i--;) {
                components = types[i];
                for (j = components.length; j--;) components[j].update();
            }

            for (i = gameObjects.length; i--;) gameObjects[i].emit("update");
        };


        Scene.prototype.clear = function() {
            var gameObjects = this.gameObjects,
                i;

            this.world = undefined;
            for (i = gameObjects.length; i--;) this.removeGameObject(gameObjects[i], true);

            this.off();

            return this;
        };


        Scene.prototype.destroy = function() {

            this.emit("destroy");
            this.clear();

            return this;
        };


        Scene.prototype.setWorld = function(world) {
            if (this.world) this.removeWorld();

            world.scene = this;
            this.world = world;

            if (this.game) world.init();

            return this;
        };


        Scene.prototype.removeWorld = function() {
            if (!this.world) return this;
            var world = this.world;

            world.scene = undefined;
            this.world = undefined;

            return this;
        };


        Scene.prototype.addGameObject = function(gameObject) {
            if (!(gameObject instanceof GameObject)) {
                Log.error("Scene.addGameObject: can't add argument to Scene, it's not an instance of GameObject");
                return this;
            }
            var gameObjects = this.gameObjects,
                index = gameObjects.indexOf(gameObject),
                components,
                i;

            if (index === -1) {
                if (gameObject.scene) gameObject.scene.removeGameObject(gameObject);

                gameObjects.push(gameObject);
                this._gameObjectHash[gameObject._id] = gameObject;
                if (gameObject._jsonId !== -1) this._gameObjectJSONHash[gameObject._jsonId] = gameObject;

                gameObject.scene = this;

                components = gameObject.components;
                for (i = components.length; i--;) this._addComponent(components[i]);

                if (this.game) gameObject.emit("init");
                this.emit("addGameObject", gameObject);
            } else {
                Log.error("Scene.addGameObject: GameObject is already a member of Scene");
            }

            return this;
        };


        Scene.prototype.addGameObjects = function() {

            for (var i = arguments.length; i--;) this.addGameObject(arguments[i]);
            return this;
        };


        Scene.prototype._addComponent = function(component) {
            if (!component) return;
            var type = component._type,
                components = this.components,
                isNew = !components[type],
                types = components[type] || (components[type] = []),
                componentTypes = this._componentTypes;

            this._componentHash[component._id] = component;
            if (component._jsonId !== -1) this._componentJSONHash[component._jsonId] = component;

            types.push(component);
            types.sort(component.sort);
            if (isNew) {
                componentTypes.push(types);
                componentTypes.sort(sortComponentTypes);
            }

            if (this.game) component.init();

            this.emit("add" + type, component);
            this.emit("addComponent", component);
        };


        function sortComponentTypes(a, b) {

            return (a[0] instanceof Transform || a[0] instanceof Transform2D) ? 1 : -1;
        }


        Scene.prototype.removeGameObject = function(gameObject, clear) {
            if (!(gameObject instanceof GameObject)) {
                Log.error("Scene.removeGameObject: can't remove argument from Scene, it's not an instance of GameObject");
                return this;
            }
            var gameObjects = this.gameObjects,
                index = gameObjects.indexOf(gameObject),
                components,
                i;

            if (index !== -1) {

                gameObjects.splice(index, 1);
                this._gameObjectHash[gameObject._id] = undefined;
                if (gameObject._jsonId !== -1) this._gameObjectJSONHash[gameObject._jsonId] = undefined;

                gameObject.scene = undefined;

                components = gameObject.components;
                for (i = components.length; i--;) this._removeComponent(components[i]);

                this.emit("removeGameObject", gameObject);
                gameObject.emit("remove", gameObject);
                if (clear) gameObject.clear();
            } else {
                Log.error("Scene.removeGameObject: GameObject is not a member of Scene");
            }

            return this;
        };


        Scene.prototype.removeGameObjects = function() {

            for (var i = arguments.length; i--;) this.removeGameObject(arguments[i]);
            return this;
        };


        Scene.prototype._removeComponent = function(component) {
            if (!component) return;
            var type = component._type,
                components = this.components,
                types = components[type],
                index = types.indexOf(component);

            this._componentHash[component._id] = undefined;
            if (component._jsonId !== -1) this._componentJSONHash[component._jsonId] = undefined;

            types.splice(index, 1);
            types.sort(component.sort);

            this.emit("remove" + type, component);
            this.emit("removeComponent", component);

            component.clear();
        };


        Scene.prototype.findByTag = function(tag, out) {
            out || (out = []);
            var gameObjects = this.gameObjects,
                gameObject, i = gameObjects.length;

            for (; i--;) {
                if ((gameObject = gameObjects[i]).hasTag(tag)) out.push(gameObject);
            }

            return out;
        };


        Scene.prototype.findByTagFirst = function(tag) {
            var gameObjects = this.gameObjects,
                gameObject, i = gameObjects.length;

            for (; i--;) {
                if ((gameObject = gameObjects[i]).hasTag(tag)) return gameObject;
            }

            return undefined;
        };


        Scene.prototype.findById = function(id) {

            return this._gameObjectHash[id];
        };


        Scene.prototype.findByJSONId = function(id) {

            return this._gameObjectJSONHash[id];
        };


        Scene.prototype.findComponentById = function(id) {

            return this._componentHash[id];
        };


        Scene.prototype.findComponentByJSONId = function(id) {

            return this._componentJSONHash[id];
        };


        Scene.prototype.toJSON = function(json) {
            json = Class.prototype.toJSON.call(this, json);
            var gameObjects = this.gameObjects,
                jsonGameObjects = json.gameObjects || (json.gameObjects = []),
                gameObject,
                i;

            json.name = this.name;
            json.world = this.world.toJSON(json.world);

            for (i = gameObjects.length; i--;) {
                if ((gameObject = gameObjects[i])) jsonGameObjects[i] = gameObject.toJSON(jsonGameObjects[i]);
            }

            return json;
        };


        Scene.prototype.fromJSON = function(json) {
            Class.prototype.fromJSON.call(this, json);
            var jsonGameObjects = json.gameObjects,
                gameObject, jsonGameObject,
                i;

            this.name = json.name;
            this.world = Class.fromJSON(json.world);
            this.world.scene = this;

            for (i = jsonGameObjects.length; i--;) {
                if (!(jsonGameObject = jsonGameObjects[i])) continue;

                if ((gameObject = this.findById(jsonGameObject._id))) {
                    gameObject.fromJSON(jsonGameObject);
                } else {
                    this.addGameObject(Class.fromJSON(jsonGameObject));
                }
            }

            return this;
        };


        return Scene;
    }
);
