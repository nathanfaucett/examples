if (typeof(define) !== "function") {
    var define = require("amdefine")(module);
}
define([
        "odin/base/class",
        "odin/core/gui/components/gui_component",
        "odin/core/gui/components/gui_transform",
        "odin/core/game/log"
    ],
    function(Class, GUIComponent, GUITransform, Log) {
        "use strict";


        /**
         * @class GUIObject
         * @extends Class
         * @brief base class for gui elements in a gui
         * @param Object options
         */

        function GUIObject(opts) {
            opts || (opts = {});

            Class.call(this);

            this.gui = undefined;

            this.tags = [];

            this.components = [];
            this._componentType = {};
            this._componentHash = {};
            this._componentJSONHash = {};

            if (opts.tag) this.addTag(opts.tag);
            if (opts.tags) this.addTags.apply(this, opts.tags);

            this.addComponent(new GUITransform(opts));
            if (opts.components) this.addComponents.apply(this, opts.components);
        }

        Class.extend(GUIObject);


        GUIObject.prototype.copy = function(other) {
            var components = other.components,
                tags = other.tags,
                otherComponent, component,
                i;

            for (i = components.length; i--;) {
                otherComponent = components[i];

                if ((component = this.getComponent(otherComponent._type))) {
                    component.copy(otherComponent);
                } else {
                    this.addComponent(otherComponent.clone());
                }
            }
            for (i = tags.length; i--;) this.addTag(tags[i]);

            if (other.gui && !this.gui) other.gui.addGUIObject(this);

            return this;
        };


        GUIObject.prototype.clear = function() {
            var components = this.components,
                tags = this.tags,
                i;

            for (i = components.length; i--;) components[i].clear();

            for (i = tags.length; i--;) this.removeTag(tags[i]);
            for (i = components.length; i--;) this.removeComponent(components[i]);

            this.off();

            return this;
        };


        GUIObject.prototype.destroy = function() {
            if (!this.gui) {
                Log.error("GUIObject.destroy: can't destroy GUIObject if it's not added to a Scene");
                return this;
            }

            this.gui.removeGUIObject(this);
            this.emit("destroy");

            this.clear();

            return this;
        };


        GUIObject.prototype.remove = function() {
            if (!this.gui) {
                Log.error("GUIObject.destroy: can't destroy GUIObject if it's not added to a Scene");
                return this;
            }

            this.gui.removeGUIObject(this);
            return this;
        };


        GUIObject.prototype.addTag = function(tag) {
            var tags = this.tags;

            if (tags.indexOf(tag) === -1) tags.push(tag);

            return this;
        };


        GUIObject.prototype.addTags = function() {

            for (var i = arguments.length; i--;) this.addTag(arguments[i]);
            return this;
        };


        GUIObject.prototype.removeTag = function(tag) {
            var tags = this.tags,
                index = tags.indexOf(tag);

            if (index !== -1) tags.splice(index, 1);

            return this;
        };


        GUIObject.prototype.removeTags = function() {

            for (var i = arguments.length; i--;) this.removeTag(arguments[i]);
            return this;
        };


        GUIObject.prototype.hasTag = function(tag) {

            return this.tags.indexOf(tag) !== -1;
        };


        GUIObject.prototype.addComponent = function(component, others) {
            if (typeof(component) === "string") component = new Class._classes[component];
            if (!(component instanceof GUIComponent)) {
                Log.error("GUIObject.addComponent: can't add passed argument, it is not an instance of GUIComponent");
                return this;
            }
            var name = component._name,
                components = this.components,
                comp, i, j;


            if (!this[name]) {
                if (component.guiObject) component = component.clone();

                components.push(component);
                this._componentType[component._type] = component;
                this._componentHash[component._id] = component;
                if (component._jsonId !== -1) this._componentJSONHash[component._jsonId] = component._jsonId;

                component.guiObject = this;
                this[name] = component;

                if (!others) {
                    for (i = components.length; i--;) {
                        comp = components[i];
                        if (!comp) continue;

                        for (j = components.length; j--;) {
                            name = components[j]._name;
                            comp[name] = components[j];
                        }
                    }
                }

                this.emit("add" + component._type, component);
                this.emit("addComponent", component);

                if (this.gui) this.gui._addComponent(component);
            } else {
                Log.error("GUIObject.addComponent: GUIObject already has a(n) " + component._type + " GUIComponent");
            }

            return this;
        };


        GUIObject.prototype.addComponents = function() {
            var length = arguments.length,
                components = this.components,
                component, name,
                i, j;

            for (i = length; i--;) this.addComponent(arguments[i], true);

            for (i = components.length; i--;) {
                component = components[i];
                if (!component) continue;

                for (j = components.length; j--;) {
                    name = components[j]._name;
                    component[name] = components[j];
                }
            }

            return this;
        };


        GUIObject.prototype.removeComponent = function(component, clear, others) {
            if (typeof(component) === "string") component = this.getComponent(component);
            if (!(component instanceof GUIComponent)) {
                Log.error("GUIObject.removeComponent: can't remove passed argument, it is not an instance of GUIComponent");
                return this;
            }
            var name = component._name,
                components = this.components,
                comp, i, j;

            if (this[name]) {

                if (!others) {
                    for (i = components.length; i--;) {
                        comp = components[i];
                        if (!comp) continue;

                        for (j = components.length; j--;) {
                            if (name === components[j]._name) comp[name] = undefined;
                        }
                    }
                }

                components.splice(components.indexOf(component), 1);
                this._componentType[component._type] = undefined;
                this._componentHash[component._id] = undefined;
                if (component._jsonId !== -1) this._componentJSONHash[component._jsonId] = undefined;

                component.guiObject = undefined;
                this[name] = undefined;

                this.emit("remove" + component._type, component);
                this.emit("removeComponent", component);
                component.emit("remove", component);

                if (this.gui) this.gui._removeComponent(component);
                if (clear) component.clear();
            } else {
                Log.error("GUIObject.removeComponent: GUIObject does not have a(n) " + type + " GUIComponent");
            }

            return this;
        };


        GUIObject.prototype.removeComponents = function() {
            var length = arguments.length,
                components = this.components,
                toRemove = arguments,
                component, name,
                i, j;

            for (i = length; i--;) this.removeComponent(arguments[i], null, true);

            for (i = components.length; i--;) {
                component = components[i];
                if (!component) continue;

                name = component._name;
                for (j = toRemove.length; j--;) {

                    if (name === toRemove[i]._name) component[name] = undefined;
                }
            }

            return this;
        };


        GUIObject.prototype.getComponent = function(type) {

            return this._componentType[type] || this[type] || this[type.toLowerCase()];
        };


        GUIObject.prototype.hasComponent = function(type) {
            var components = this.components,
                i;

            for (i = components.length; i--;) {
                if (components[i]._type === type) return true;
            }

            return false;
        };


        GUIObject.prototype.findComponentById = function(id) {

            return this._componentHash[id];
        };


        GUIObject.prototype.findComponentByJSONId = function(id) {

            return this._componentJSONHash[id];
        };


        GUIObject.prototype.toJSON = function(json) {
            json = Class.prototype.toJSON.call(this, json);
            var components = this.components,
                jsonComponents = json.components || (json.components = []),
                tags = this.tags,
                jsonTags = json.tags || (json.tags = []),
                component,
                i = components.length;

            for (; i--;) {
                if ((component = components[i]).json) jsonComponents[i] = component.toJSON(jsonComponents[i]);
            }
            for (i = tags.length; i--;) jsonTags[i] = tags[i];

            return json;
        };


        GUIObject.prototype.fromJSON = function(json) {
            Class.prototype.fromJSON.call(this, json);
            var jsonComponents = json.components || (json.components = []),
                component, jsonComponent, tag,
                tags = this.tags,
                jsonTags = json.tags || (json.tags = []),
                i = jsonComponents.length;

            for (; i--;) {
                if (!(jsonComponent = jsonComponents[i])) continue;

                if ((component = this.findComponentById(jsonComponent._id)) || (component = this.getComponent(jsonComponent._type))) {
                    component.fromJSON(jsonComponent);
                } else {
                    this.addComponent(Class.fromJSON(jsonComponent));
                }
            }

            for (i = jsonTags.length; i--;) {
                if (tags.indexOf((tag = jsonTags[i])) === -1) tags.push(tag);
            }

            return this;
        };


        return GUIObject;
    }
);
