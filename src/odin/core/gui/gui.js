if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/class",
        "odin/core/gui/gui_object",
        "odin/core/game/log"
    ],
    function(Class, GUIObject, Log) {
        "use strict";


        /**
         * GUIs manage GUIObjects and their Components
         * @class Odin.GUI
         * @extends Odin.Class
         * @param Object options
         */
        function GUI(opts) {
            opts || (opts = {});

            Class.call(this);

            this.game = undefined;

            this.name = opts.name != undefined ? opts.name : "GUI_" + this._id;

            this.width = 960;
            this.height = 640;
            this.aspect = this.width / this.height;
            this.invWidth = 1 / this.width;
            this.invHeight = 1 / this.height;
			
            this.guiObjects = [];
            this._guiObjectHash = {};
            this._guiObjectJSONHash = {};

            this.components = {};
            this._componentTypes = [];
            this._componentHash = {};
            this._componentJSONHash = {};

            if (opts.guiObjects) this.addGUIObjects.apply(this, opts.guiObjects);
        }

        Class.extend(GUI);


        GUI.prototype.copy = function(other) {
            var otherGUIObjects = other.guiObjects,
                i = otherGUIObjects.length;

            this.clear();
            this.name = other.name + "." + this._id;

            while (i--) this.addGUIObject(otherGUIObjects[i].clone());

            return this;
        };


        GUI.prototype.init = function() {
            var guiObjects = this.guiObjects,
                componentTypes = this._componentTypes,
                i = componentTypes.length;

            i = guiObjects.length;
            while (i--) guiObjects[i].emit("init");
        };


        GUI.prototype.start = function() {
            var types = this._componentTypes,
                guiObjects = this.guiObjects,
                components, component, i, j;

            i = types.length;
            while (i--) {
                components = types[i];
                j = components.length;
                while (j--) {
                    component = components[j];

                    component.start();
                    component.emit("start");
                }
            }

            i = guiObjects.length;
            while (i--) guiObjects[i].emit("start");
        };


        GUI.prototype.update = function() {
            var types = this._componentTypes,
                guiObjects = this.guiObjects,
                components, i, j;

            i = types.length;
            while (i--) {
                components = types[i];
                j = components.length;
                while (j--) components[j].update();
            }

            i = guiObjects.length;
            while (i--) guiObjects[i].emit("update");
        };


        GUI.prototype.clear = function() {
            var guiObjects = this.guiObjects,
                i = guiObjects.length;

            while (i--) this.removeGUIObject(guiObjects[i], true);

            this.off();

            return this;
        };


        GUI.prototype.destroy = function() {

            this.emit("destroy");
            this.clear();

            return this;
        };


        GUI.prototype.addGUIObject = function(guiObject) {
            if (!(guiObject instanceof GUIObject)) {
                Log.error("GUI.addGUIObject: can't add argument to GUI, it's not an instance of GUIObject");
                return this;
            }
            var guiObjects = this.guiObjects,
                index = guiObjects.indexOf(guiObject),
                components, transform, children, child,
                i;

            if (index === -1) {
                if (guiObject.gui) guiObject.gui.removeGUIObject(guiObject);

                guiObjects.push(guiObject);
                this._guiObjectHash[guiObject._id] = guiObject;
                if (guiObject._jsonId !== -1) this._guiObjectJSONHash[guiObject._jsonId] = guiObject;

                guiObject.gui = this;

                components = guiObject.components;
                i = components.length;
                while (i--) this._addComponent(components[i]);

                if ((transform = guiObject.guiTransform)) {
                    i = (children = transform.children).length;

                    while (i--) {
                        if ((child = children[i].guiObject) && !this.hasGUIObject(child)) {
                            this.addGUIObject(child);
                        }
                    }
                }

                if (this.game) guiObject.emit("init");
                this.emit("addGUIObject", guiObject);
            } else {
                Log.error("GUI.addGUIObject: GUIObject is already a member of GUI");
            }

            return this;
        };


        GUI.prototype.addGUIObjects = function() {
            var i = arguments.length;

            while (i--) this.addGUIObject(arguments[i]);
            return this;
        };


        GUI.prototype._addComponent = function(component) {
            if (!component) return;
            var type = component._type,
                components = this.components,
                isNew = !components[type],
                types = components[type] || (components[type] = []),
                componentTypes = this._componentTypes;

            this._componentHash[component._id] = component;
            if (component._jsonId !== -1) this._componentJSONHash[component._jsonId] = component;

            types.push(component);

            if (isNew) {
                componentTypes.push(types);
                componentTypes.sort(sortComponentTypes);
            }

            types.sort(component.sort);

            this.emit("add" + type, component);
            this.emit("addComponent", component);

            if (this.game) {
                component.start();
                component.emit("start");
            }
        };


        function sortComponentTypes(a, b) {

            return (b[0].constructor.order || 0) - (a[0].constructor.order || 0);
        }


        GUI.prototype.removeGUIObject = function(guiObject, clear) {
            if (!(guiObject instanceof GUIObject)) {
                Log.error("GUI.removeGUIObject: can't remove argument from GUI, it's not an instance of GUIObject");
                return this;
            }
            var guiObjects = this.guiObjects,
                index = guiObjects.indexOf(guiObject),
                components, transform, children, child,
                i;

            if (index !== -1) {

                guiObjects.splice(index, 1);
                this._guiObjectHash[guiObject._id] = undefined;
                if (guiObject._jsonId !== -1) this._guiObjectJSONHash[guiObject._jsonId] = undefined;

                guiObject.gui = undefined;

                components = guiObject.components;
                i = components.length;
                while (i--) this._removeComponent(components[i]);

                if ((transform = guiObject.guiTransform)) {
                    i = (children = transform.children).length;

                    while (i--) {
                        if ((child = children[i].guiObject) && this.hasGUIObject(child)) {
                            this.removeGUIObject(child);
                        }
                    }
                }

                this.emit("removeGUIObject", guiObject);
                guiObject.emit("remove", guiObject);
                if (clear) guiObject.clear();
            } else {
                Log.error("GUI.removeGUIObject: GUIObject is not a member of GUI");
            }

            return this;
        };


        GUI.prototype.removeGUIObjects = function() {
            var i = arguments.length;

            while (i--) this.removeGUIObject(arguments[i]);
            return this;
        };


        GUI.prototype._removeComponent = function(component) {
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


        GUI.prototype.hasGUIObject = function(guiObject) {

            return !!~this.guiObjects.indexOf(guiObject);
        };


        GUI.prototype.findByTag = function(tag, out) {
            out || (out = []);
            var guiObjects = this.guiObjects,
                guiObject, i = guiObjects.length;

            while (i--) {
                if ((guiObject = guiObjects[i]).hasTag(tag)) out.push(guiObject);
            }

            return out;
        };


        GUI.prototype.findByTagFirst = function(tag) {
            var guiObjects = this.guiObjects,
                guiObject, i = guiObjects.length;

            while (i--) {
                if ((guiObject = guiObjects[i]).hasTag(tag)) return guiObject;
            }

            return undefined;
        };


        GUI.prototype.findById = function(id) {

            return this._guiObjectHash[id];
        };


        GUI.prototype.findByJSONId = function(id) {

            return this._guiObjectJSONHash[id];
        };


        GUI.prototype.findComponentById = function(id) {

            return this._componentHash[id];
        };


        GUI.prototype.findComponentByJSONId = function(id) {

            return this._componentJSONHash[id];
        };


        GUI.prototype.find = function(name) {
            var guiObjects = this.guiObjects,
                child, i = guiObjects.length;

            while (i--) {
                child = guiObjects[i];

                if (child.name === name) return child;
                if ((child = child.find(name))) return child;
            }

            return undefined;
        };


        GUI.prototype.toJSON = function(json) {
            json = Class.prototype.toJSON.call(this, json);
            var guiObjects = this.guiObjects,
                jsonGUIObjects = json.guiObjects || (json.guiObjects = []),
                guiObject,
                i = guiObjects.length;

            json.name = this.name;

            while (i--) {
                if ((guiObject = guiObjects[i])) jsonGUIObjects[i] = guiObject.toJSON(jsonGUIObjects[i]);
            }

            return json;
        };


        GUI.prototype.fromJSON = function(json) {
            Class.prototype.fromJSON.call(this, json);
            var jsonGUIObjects = json.guiObjects,
                guiObject, jsonGUIObject,
                i = jsonGUIObjects.length;

            this.name = json.name;

            while (i--) {
                if (!(jsonGUIObject = jsonGUIObjects[i])) continue;

                if ((guiObject = this.findByJSONId(jsonGUIObject._id))) {
                    guiObject.fromJSON(jsonGUIObject);
                } else {
                    this.addGUIObject(Class.fromJSON(jsonGUIObject));
                }
            }

            return this;
        };


        return GUI;
    }
);
