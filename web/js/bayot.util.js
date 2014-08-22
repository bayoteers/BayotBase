/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (C) 2012 Jolla Ltd.
 * Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>
 *
 * The Initial Developer of the Original Code is "Nokia Corporation"
 * Portions created by the Initial Developer are Copyright (C) 2011 the
 * Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   David Wilson <ext-david.3.wilson@nokia.com>
 */


/**
 * Run a function, logging any exception thrown to the console. Used for
 * debugging XMLHTTPRequest event handlers, whose exceptions are silently
 * discarded.
 */
function absorb(fn)
{
    try {
        return fn();
    } catch(e) {
        if(typeof console !== 'undefined') {
            console.error('absorb(): %o', e);
        }
        throw e;
    }
}


/**
 * RPC object. Wraps the parameters of a Bugzilla RPC up along with callbacks
 * indicating completion state.
 *
 * All methods return the Rpc object itself, so that the calls can be chained.
 *
 *      new Rpc('Foo', 'bar', {baz:1})
 *          .done(onBarSuccess)
 *          .fail(onBarFail)
 *          .complete(onBarComplete);
 *
 */
var Rpc = Base.extend({
    /**
     * Create an instance.
     * @param {String} namespace
     *      RPC namespace.
     * @param {String} method
     *      RPC method name.
     * @param {Object} params
     *      RPC method parameters.
     * @param {Boolean} immediate
     *      Optional; if false, don't immediately start the RPC (e.g. if it is
     *      going to be added to a queue). Defaults to true.
     */
    constructor: function(namespace, method, params, immediate)
    {
        this.namespace = namespace
        this.method = method;
        this.params = params;
        this.response = null;
        this.error = null;

        this._startedCb = jQuery.Callbacks();
        this._doneCb = jQuery.Callbacks();
        this._failCb = jQuery.Callbacks();
        this._completeCb = jQuery.Callbacks()

        if(immediate !== false) {
            this.start();
        }
    },

    /**
     * Add callback to be called when the RPC is started.
     * @param  {Function} cb
     * @return {Rpc}
     *
     * Function cb gets the Rpc object as first parameter.
     */
    started: function(cb)
    {
        this._startedCb.add(cb);
        return this;
    },

    /**
     * Add function to be called when the RPC succeeds.
     * @param  {Function} cb
     * @return {Rpc}
     *
     * Function cb gets RPC result as first parameter.
     */
    done: function(cb)
    {
        this._doneCb.add(cb);
        return this;
    },

    /**
     * Add function to be called when the RPC fails.
     * @param  {Function} cb
     * @return {Rpc}
     *
     * Function cb gets RPC error object as first parameter.
     */
    fail: function(cb)
    {
        this._failCb.add(cb);
        return this;
    },

    /**
     * Add function to be called when the RPC completes (success or failure).
     * @param  {Function} cb
     * @return {Rpc}
     *
     * Function cb gets the Rpc object as first parameter.
     */
    complete: function(cb)
    {
        this._completeCb.add(cb);
        return this;
    },

    /**
     * Start the RPC.
     * @return {Rpc}
     *
     * Should be used when Rpc object was constructed with immediate == false
     */
    start: function()
    {
        $.jsonRPC.setup({
            endPoint: 'jsonrpc.cgi',
            namespace: this.namespace
        })

        $.jsonRPC.request(this.method, {
            params: [this.params || {}],
            success: $.proxy(this, "_onSuccess"),
            error: $.proxy(this, "_onError")
        });

        this._startedCb.fire(this);
        return this;
    },

    /**
     * Fired on success; records the RPC result and fires any callbacks.
     * @private
     */
    _onSuccess: function(response)
    {
        this.response = response.result;
        var that = this;
        absorb(function()
        {
            that._doneCb.fire(response.result);
            that._completeCb.fire(that);
        });
    },

    /**
     * Fired on failure; records the error and fires any callbacks.
     * @private
     */
    _onError: function(response)
    {
        if ($.isPlainObject(response.error)){
            this.error = response.error;
        } else {
            /*
             * jquery.jsonrpc response in case of network or other unknown
             * errors is { error: "Internal Server Error", version "2.0" }
             * Not sure if that is correct, or what would be the correct way to
             * handle that, so fixing it here
             */
            this.error = {
                message: "Network error or other unexpected problem",
                code: -32603
            };
        }
        if(typeof console !== 'undefined') {
            console.log('jsonRPC error: %o', this.error);
        }
        var that = this;
        absorb(function()
        {
            that._failCb.fire(that.error);
            that._completeCb.fire(that);
        });
    }
});


/**
 * Display a small progress indicator at the top of the document while any
 * jQuery XMLHttpRequest is in progress.
 */
var RpcProgressView = {
    init: function()
    {
        if(this._progress) {
            return;
        }

        this._active = 0;
        this._progress = $('<div class="bb-working">Working&nbsp;<span class="bb-spinner"></span></div>');
        this._progress.hide();
        this._progress.appendTo('body');
        $(document).ajaxSend($.proxy(this, "_onAjaxSend"));
        $(document).ajaxComplete($.proxy(this, "_onAjaxComplete"));
    },

    /**
     * Handle request start by incrementing the active count.
     */
    _onAjaxSend: function()
    {
        this._active++;
        this._progress.show();
    },

    /**
     * Handle request completion by decrementing the active count, and hiding
     * the progress indicator if there are no more active requests.
     */
    _onAjaxComplete: function()
    {
        this._active--;
        if(! this._active) {
            this._progress.hide();
        }
    }
};

// TODO: this should be moved to somewhere sensible.
$(document).ready($.proxy(RpcProgressView, "init"));

/**
 * Bug class.
 * Stores single bug and handles calling create and update RPC methods.
 */
var Bug = Base.extend({

    constructor: function(bug, noAlerts)
    {
        // Holders for deffed objects
        this._fetching = null;
        this._alert = !noAlerts;

        // Fires when bug field has been updated in DB
        this._updateCb = jQuery.Callbacks();
        this.updated = $.proxy(this._updateCb, "add");
        // Fires when bug field is changed via set/add/remove
        // Callback params (bug_object, field_name, new_field_value)
        this._changedCb = jQuery.Callbacks();
        this.changed = $.proxy(this._changedCb, "add");
        // Fires when choices for field change, i.e when the field it depends
        // on changes
        // Callback params (bug_object, changed_field, dependent_field, new_choices)
        this._choicesCb = jQuery.Callbacks();
        this.choicesUpdated = $.proxy(this._choicesCb, "add");
        // Fires when visibility of a field change, i.e when the field it
        // depends on changes
        // Callback params (bug_object, changed_field, controlled_field, is_visible)
        this._visibilityCb = jQuery.Callbacks();
        this.visibilityUpdated = $.proxy(this._visibilityCb, "add");

        if (bug.id) {
            // TODO: Might need a better check of bug data completeness
            this.id = bug.id;
            this._data = $.extend(true, {}, bug);
            this._modified = {};
        } else {
            this.id = null;
            this._modified = $.extend(true, {}, bug);
            this._data = {};
            for (var name in BB_FIELDS) {
                if (bug[name] != undefined) continue;
                var def = this.defaultValue(name);
                if (def != undefined) this.set(name, def);
            }
        }
    },
    isModified: function()
    {
        return !$.isEmptyObject(this._modified);
    },

    /**
     * Save changes or new bug
     */
    save: function()
    {
        if (!this.isModified()) {
            var def = $.Deferred()
            def.resolve(this);
            return def;
        }
        this._saving = $.Deferred();
        if (this.id) {
            var rpc = new Rpc("Bug", "update",
                    this._getUpdateParams());
        } else {
            var rpc = new Rpc("Bug", "create",
                    this._getCreateParams());
        }
        rpc.done($.proxy(this, "_saveDone"))
            .fail($.proxy(this, "_saveFail"));
        return this._saving.promise()
    },

    _getUpdateParams: function()
    {
        var params = {ids: [this.id]};
        for (var name in this._modified) {
            if (name == 'comment') {
                params[name] = {body: this._modified[name]};
                // TODO private comment support?
            } else if (this.field(name).multivalue) {
                var add = [];
                var remove = this._data[name].map(String);
                this._modified[name].forEach(function(value) {
                    var index = remove.indexOf(String(value));
                    if(index == -1) {
                        add.push(value);
                    } else {
                        remove.splice(index, 1);
                    }
                });
                params[name] = {add: add, remove: remove};
            } else {
                params[name] = this._modified[name];
            }
        }
        return params;
    },

    _getCreateParams: function()
    {
        var params = {};
        for (var name in this._modified) {
            var field = this.field(name);
            var value = this._modified[name];
            if (!field.is_on_bug_entry) continue;
            if (!value) continue;
            if (field.multivalue) {
                if (typeof(value) == "string") {
                    value = value.split(/\s?,\s?/);
                } else if (typeof(value) == "number") {
                    value = [value];
                }
            }
            params[name] = value;
        }
        return params;
    },

    _saveDone: function(result)
    {
        this._modified = {};
        if (result.id) {
            // Newly created bug, update
            this.id = result.id;
            this.update();
        } else {
            // Existing bug updated
            var changes = result.bugs[0].changes;
            for (var name in changes) {
                var field = this.field(name);
                var change = changes[name];
                if (field.multivalue) {
                    if (!$.isArray(this._data[name])) this._data[name] = [];
                    var added = change.added ? change.added.split(/\s*,\s*/) : [];
                    var removed = change.removed ? change.removed.split(/\s*,\s*/) : [];
                    if (field.type == Bug.FieldType.BUGID) {
                        added = added.map(Number);
                        removed = removed.map(Number);
                    }
                    for (var i=0; i < added.length; i++) {
                        this._data[name].push(added[i]);
                    }
                    for (var i=0; i < removed.length; i++) {
                        var index = this._data[name].indexOf(removed[i]);
                        if (index != -1) this._data[name].splice(index,1);
                    }
                } else if (name == 'work_time') {
                    // Special handling for work_time / actual_time
                    name = 'actual_time';
                    this._data['actual_time'] += Number(change.added);
                } else if (change.added) {
                    this._data[name] = change.added;
                } else if (change.removed) {
                    this._data[name] = "";
                }

                this._updateCb.fire(this, name, this._data[name]);
            }
            if (this._saving) {
                this._saving.resolve(this);
                this._saving = null;
            }
        }
    },
    _saveFail: function(error)
    {
        if (this._alert) alert("Saving bug failed: " + error.message);
        if (this._saving) {
            this._saving.reject(this, error);
            this._saving = null;
        }
    },

    /**
     * Update bug data from database
     */
    update: function() {
        if (this._fetching) return this._fetching.promise();
        if (!this.id) throw "Can't update unsaved bug";
        this._fetching = $.Deferred();
        new Rpc("Bug", "get", {ids:[this.id]})
            .done($.proxy(this, "_getDone"))
            .fail($.proxy(this, "_getFail"));
        return this._fetching.promise();
    },

    _getDone: function(result) {
        for (var name in result.bugs[0]) {
            try {
                var field = this.field(name);
                this.set(field, result.bugs[0][name]);
            } catch(e) {
                // We just skip unknown fields
                continue;
            }
        }
        for (var name in this._modified) {
            this._data[name] = this._modified[name];
            delete this._modified[name];
            this._updateCb.fire(this, name, this._data[name]);

        }
        if (this._saving) {
            this._saving.resolve(this);
            this._saving = null;
        }
        if (this._fetching) {
            this._fetching.resolve(this);
            this._fetching = null;
        }
    },

    _getFail: function(error) {
        if (this._alert) alert("Loading bug failed: " + error.message);
        if (this._saving) {
            this._saving.reject(this);
            this._saving = null;
        }
        if (this._fetching) {
            this._fetching.reject(this);
            this._fetching = null;
        }
    },

    value: function(field)
    {
        field = this.field(field);
        return this._modified[field.name] || this._data[field.name];
    },

    defaultValue: function(field)
    {
        field = this.field(field);
        for (var i=0; i < field.values.length; i++) {
            if (field.values[i].is_default) return field.values[i].name;
        }
        if (this.isMandatory(field)) {
            var choices = this.choices(field);
            if (choices.length == 1) return choices[0];
        }
    },

    choices: function(field)
    {
        field = this.field(field);
        var current = this._data[field.name];
        var choices = [];
        var visibleFor = field.value_field ? this.value(field.value_field) : null;
        var allowUnconfrimed = field.name == 'status' ?
                this._allowUnconfirmed() : true;
        field.values.forEach(function(value) {
            if (visibleFor && value.visibility_values.indexOf(visibleFor) == -1)
                return;
            if (value.name == 'UNCONFIRMED' && !allowUnconfrimed)
                return;
            choices.push(value);
        });
        choices.sort(function(a,b) {
            var result = a.sort_key - b.sork_key;
            if(result == 0) {
                if (a.name < b.name) result = -1;
                if (a.name > b.name) result = 1;
            }
            return result;
        });
        choices = choices.map(function(value) {return value.name});
        return choices;
    },

    _allowUnconfirmed: function() {
        var field = this.field('product');
        var product = this.value(field);
        for (var i=0; i < field.values.length; i++) {
            if (field.values[i].name == product) {
                return field.values[i].allows_unconfirmed;
            }
        }
        return true;
    },

    isMandatory: function(field)
    {
        field = this.field(field);
        return field.is_mandatory && this.choices(field).length > 1
                && this.isVisible(field);
    },

    /**
     * Get field descriptors for fields required in Bug.create() RPC.
     */
    requiredFields: function() {
        var required = [];
        for (var name in BB_FIELDS) {
            var field = BB_FIELDS[name];
            if (this.isMandatory(field)) {
                required.push(field);
            }
        }
        return required;
    },

    /**
     * Set bug field values
     *
     * set({ field_name: value, ...}) - to set multiple values
     *   or
     * set(field_name, value) - to set single value
     */
    set: function(field, value) {
        if(arguments.length == 1) {
            for (var key in field) {
                this.set(key, name[key]);
            }
            return;
        }
        field = this.field(field);
        if (field.immutable)
            return;
        var diff = false;
        if (field.multivalue) {
            if (!value) {
                value = [];
            } else if ( !$.isArray(value) ){
                value = value.split(/\s*,\s*/);
            }
            if (this._data[field.name] == undefined) this._data[field.name] = [];
            diff = value.sort().join() != this._data[field.name].sort().join();
        } else {
            diff = value != this._data[field.name];
        }
        if (diff){
            if (field.type == Bug.FieldType.BUGID) {
                if(field.multivalue) {
                    value = value.map(Number);
                } else {
                    value = Number(value);
                }
            }
            this._modified[field.name] = value;
            this._changedCb.fire(this, field.name, value);
            this._checkDependencies(field.name);
            this._checkVisibilities(field.name);
        } else {
            delete this._modified[field.name];
            this._checkDependencies(field.name);
            this._checkVisibilities(field.name);
        }
    },
    add: function(field, value) {
        field = this.field(field);
        if (field.type == Bug.FieldType.BUGID) value = Number(value);
        if (!field.multivalue) {
            this.set(field, value);
        } else {
            var new_value = this.value(field).slice();
            if (new_value.indexOf(value) == -1) {
                new_value.push(value);
                this.set(field, new_value);
            }
        }
    },
    remove: function(field, value) {
        field = this.field(field);
        if (field.type == Bug.FieldType.BUGID) value = Number(value);
        if (!field.multivalue) {
            if (value == this.value(field)) this.set(field, '');
        } else {
            var new_value = this.value(field).slice();
            var index = new_value.indexOf(value);
            if (index != -1) {
                new_value.splice(index, 1);
                this.set(field, new_value);
            }
        }
    },
    _checkDependencies: function(name)
    {
        if (!Bug._depends[name]) return;
        for (var i=0; i < Bug._depends[name].length; i++) {
            var dname = Bug._depends[name][i];
            var choices = this.choices(dname);
            if (choices.indexOf(this.value(dname)) == -1) {
                this.set(dname, choices[0]);
            }
            this._choicesCb.fire(this, name, dname, choices);
        }
    },
    _checkVisibilities: function(name)
    {
        if (!Bug._visibility[name]) return;
        var values = this.value(name);
        if (!$.isArray(values)) values = [values];
        for (var i=0; i < Bug._visibility[name].length; i++) {
            var dname = Bug._visibility[name][i];
            var visibleOn = this.field(dname).visibility_values;
            for (var j=0; j < values.length; j++) {
                if(visibleOn.indexOf(values[j]) == -1) {
                    this._visibilityCb.fire(this, name, dname, false);
                } else {
                    this._visibilityCb.fire(this, name, dname, true);
                }
            }
        }
    },

    /**
     * Check if field is visible
     * @param  {String}  name Field name
     * @return {Boolean}      True if field is visible
     */
    isVisible: function(field)
    {
        field = this.field(field);
        if (!field.visibility_field) return true;
        var visibilityValue = this.value(field.visibility_field);
        if (field.visibility_values.indexOf(visibilityValue) != -1) return true;
        return false;
    },

    /**
     * Creates input element for given field
     * @param  {String} field   Name of field descriptor
     * @param  {Boolean} hidden  If true, then field is created as type=hidden
     * @param  {Boolean} connect If true, then the change events are connected
     * @return {Object}         jQuery element
     */
    createInput: function(field, hidden, connect) {
        field = this.field(field);
        if (hidden) {
            var element = $('<input type="hidden"></input>');
        } else if (field.type == Bug.FieldType.SELECT ||
                field.type == Bug.FieldType.MULTI) {
            var element = $("<select></select>");
        } else if (field.type == Bug.FieldType.TEXT) {
            var element = $("<textarea></textarea>");
        } else {
            var element = $("<input></input>");
            element.addClass('text_input field_value');
        }
        element.attr("name", field.name);

        if (element.is('select')) {
            if (field.type == Bug.FieldType.MULTI || field.multivalue) {
                element.attr('multiple', 'multiple');
            }
            this._setSelectOptions(element);
            this.set(field, element.val());
        } else {
            var value = this.value(field.name);
            if (value == undefined) value = this.defaultValue(field);
            element.val(value);
        }

        if (field.type == Bug.FieldType.USER) {
            element.userautocomplete({multiple: field.name == 'cc'});
        }
        if (field.type == Bug.FieldType.KEYWORDS) {
            element.keywordautocomplete();
        }
        if (connect) {
            element.change($.proxy(this, "_inputChanged"));
            if(field.value_field) {
                var that = this;
                this.choicesUpdated(function(bug, changed, field, choices) {
                    if (element.attr('name') != field) return;
                    if (element.attr('type') == 'hidden') {
                        element.val(bug.value(field));
                    } else if(element.is('select')) {
                        that._setSelectOptions(element);
                    }
                });
            }
            if(field.visibility_field) {
                var that = this;
                this.visibilityUpdated(
                    function(bug, changed, field, is_visible){
                        if (element.attr('name') != field) return;
                        if(is_visible) {
                            element.show();
                            // reset value when field is shown
                            that.set(field, that._data[field]);
                        } else {
                            element.hide();
                            // if field is hidden it should not have value
                            that.set(field, undefined);
                        }
                    });
            }
        }
        if (!this.isVisible(field.name)) {
            element.hide();
        }
        return element;
    },
    /**
     * Input change handler
     */
    _inputChanged: function(ev)
    {
        var target = $(ev.target);
        var name = target.attr('name');
        var value = target.val();
        this.set(name, value);
    },

    /**
     * Set options for select field
     */
    _setSelectOptions: function(element)
    {
        if(!element.is('select')) return;
        element.empty();
        var name = element.attr('name');
        var currentValue = this.value(name);
        var defaultValue = this.defaultValue(name);
        if (!$.isArray(currentValue)) currentValue = [currentValue];
        this.choices(name).forEach(function(value) {
            var option = $('<option>' + value + '</option>')
                .attr('value', value);
            if ( (currentValue.length == 0 && value == defaultValue) ||
                 (currentValue.indexOf(value) != -1) )
            {
                option.attr('selected', 'selected');
                element.prepend(option);
            } else {
                if (name != 'product'
                    || BB_CONFIG.user.enterable_products.indexOf(value) != -1)
                {
                    element.append(option);
                }
            }
        });
    },

    /**
     * Create lable element for the field input
     * @param  {String} field Name or descriptor
     * @return {Object}       jQuery element
     */
    createLabel: function(field)
    {
        field = this.field(field);
        var element = $("<label>")
            .attr('for', field.name)
            .text(field.display_name);
        if (!this.isVisible(field.name)) {
            element.hide();
        }
        this.visibilityUpdated(
            function(bug, changed, field, is_visible){
                if (element.attr('for') != field) return;
                if(is_visible) {
                    element.show();
                } else {
                    element.hide();
                }
            });
        return element;
    },

    field: function(field)
    {
        if (!$.isPlainObject(field)) {
            var fdesc = BB_FIELDS[field] || BB_FIELDS[Bug._internal[field]];
            if(!fdesc) throw "Unknown field: " + field;
            return fdesc;
        }
        return field;
    }

}, {
    get: function(ids, callback)
    {
        var multiple = true;
        if (!$.isArray(ids)) {
            ids = [ids];
            multiple = false;
        }
        new Rpc("Bug", "get", {ids: ids})
            .done(function(result) {
                var bugs = [];
                for(var i=0; i < result.bugs.length; i++) {
                    bugs.push(new Bug(result.bugs[i]));
                }
                if (!multiple) {
                    bugs = bugs[0];
                }
                callback(bugs);
            }).fail(function(error) {
                callback([], error.message);
            });
    },

    /**
     * Field type numbers
     */
    FieldType: {
        UNKNOWN: 0,
        STRING: 1,
        SELECT: 2,
        MULTI: 3,
        TEXT: 4,
        DATE: 5,
        BUGID: 6,
        URL: 7,
        KEYWORDS: 8,
        USER: 11,
        BOOLEAN: 12
    },

    _initFields: function() {
        // Field dependency map
        Bug._depends = {};
        // Field visibility map
        Bug._visibility = {};
        // Field "internal" name map
        Bug._internal = {};
        for (var name in BB_FIELDS) {
            var fdesc = BB_FIELDS[name];
            if (fdesc.value_field) {
                if (Bug._depends[fdesc.value_field] == undefined)
                    Bug._depends[fdesc.value_field] = [];
                Bug._depends[fdesc.value_field].push(fdesc.name);
            }
            if (fdesc.visibility_field) {
                if (Bug._visibility[fdesc.visibility_field] == undefined)
                    Bug._visibility[fdesc.visibility_field] = [];
                Bug._visibility[fdesc.visibility_field].push(fdesc.name);
            }
            if (fdesc.name != fdesc.internal_name) {
                Bug._internal[fdesc.internal_name] = fdesc.name;
            }
        }
    }
});

Bug._initFields();

/**
 * User input field autocomplete widget
 */
$.widget("bb.userautocomplete", {
    // Default options
    options: {
        multiple: false
    },
    /**
     * Initialize the widget
     */
    _create: function()
    {
        // Initialize autocomplete on the element
        this.element.autocomplete({
            delay: 500,
            search: $.proxy(this, "_search"),
            source: $.proxy(this, "_source"),
            focus: $.proxy(this, "_onItemFocus"),
            select: $.proxy(this, "_onItemSelect")
        })
        .data("autocomplete")._renderItem = function(ul, item) {
            // Custom rendering for the suggestion list items
            return $("<li></li>").data("item.autocomplete", item)
                .append("<a>" + item.real_name + "</a>")
                .appendTo(ul);
        };
        // Add spinner
        this.spinner = $("<div/>").addClass("bb-spinner")
            .css("position", "absolute")
            .hide();
        this.element.after(this.spinner)

        this._respCallback = null;
    },

    /**
     * Destroy the widget
     */
    destroy: function()
    {
        this.element.autocomplete("destroy");
        this.spinner.remove();
        $.Widge.prototype.destroy.apply(this);
    },

    /**
     * jQuery UI autocomplete item focus handler
     */
    _onItemFocus: function(event, ui) {

        if (!this.options.multiple) {
            this.element.val(ui.item.name);
        }
        return false;
    },

    /**
     * jQuery UI autocomplete item select handler
     */
    _onItemSelect: function(event, ui) {
        var pos = this.element.scrollLeft()
        var value = ui.item.name
        if (this.options.multiple) {
            // remove current input
            terms = this.element.val().split(/,\s*/);
            terms.pop();
            // add new value and placeholder for ,
            terms.push(value);
            terms.push('');
            value = terms.join(', ');
        }
        this.element.val(value);
        this.element.scrollLeft(pos + 1000);
        this.element.change();
        return false;
    },

    /**
     * jQuery UI autocomplete search term check
     */
    _search: function(event, ui) {
        var value = this.element.val();
        if (this.options.multiple) {
            // for multivalue check only last input
            value = value.split(/,\s*/).pop();
        }
        if (value.length < 3 ) return false;
    },

    /**
     * jQuery UI autocomplete data source function
     */
    _source: function(request, responce) {
        this._respCallback = responce;
        var value = request.term.toLowerCase();
        if (this.options.multiple) {
            value = value.split(/,\s*/).pop();
        }
        var terms = this._splitTerms(value);

        new Rpc("User", "get", {match:terms})
            .done($.proxy(this, "_userGetDone"))
            .complete($.proxy(function(){
                this.spinner.hide();
            }, this));

        this.spinner.css("top", this.element.position().top)
            .css("left", this.element.position().left + this.element.width())
            .show();
    },

    /**
     * Helper to split user input into separate terms
     */
    _splitTerms: function(term) {
        var result = [];
        var tmp = term.split(' ');
        for (var i=0; i < tmp.length; i++) {
            if (tmp[i].length > 0) result.push(tmp[i]);
        }
        return result;
    },

    /**
     * Handler for User.get() rpc
     */
    _userGetDone: function(result) {
        if (this._respCallback) {
            this._respCallback(result.users);
        }
        this._respCallback = null;
    }
});

/**
 * Keyword input field autocomplete widget
 */
$.widget("bb.keywordautocomplete", {
    /**
     * Initialize the widget
     */
    _create: function()
    {
        // Initialize autocomplete on the element
        this.element.autocomplete({
            delay: 500,
            focus: function() { return false },
            select: $.proxy(this, "_onItemSelect"),
            source: $.proxy(this, "_source")
        })
        // Add spinner
        this.spinner = $("<div/>").addClass("bb-spinner")
            .css("position", "absolute")
            .hide();
        this.element.after(this.spinner)
        this.keywords = BB_FIELDS.keywords.values.map(
                function(value){return value.name})
    },

    /**
     * Destroy the widget
     */
    destroy: function()
    {
        this.element.autocomplete("destroy");
        this.spinner.remove();
        $.Widge.prototype.destroy.apply(this);
    },

    /**
     * jQuery UI autocomplete item select handler
     */
    _onItemSelect: function(event, ui) {
        var pos = this.element.scrollLeft()
        var value = ui.item.value
        // remove current input
        terms = this.element.val().split(/,\s*/);
        terms.pop();
        // add new value and placeholder for ,
        terms.push(value);
        terms.push('');
        value = terms.join(', ');
        this.element.val(value);
        this.element.scrollLeft(pos + 1000);
        this.element.change();
        return false;
    },

    /**
     * jQuery UI autocomplete data source
     */
    _source: function(request, response) {
        var term = request.term.split(/,\s*/).pop();
        response( $.ui.autocomplete.filter(
            this.keywords, term ) );
    }
});

/**
 * Bug entry widget
 */
$.widget("bb.bugentry", {
    /**
     * Default options
     *
     * mode: 'create' or 'edit'
     * fields: Fields to display in the form
     * title: Title of the dialog
     * defaults: Default values to populate the form with
     * bug: Bug object to edit or to use when cloning fields to new bug
     * clone: Fields to clone from existing bug when creating new bug
     */
    options: {
        mode: 'create',
        fields: null,
        title: '',
        defaults: {},
        bug: null,
        clone: []
    },

    /**
     * Initialize the widget
     */
    _create: function()
    {
        // Set click handler
        this.element.on("click", $.proxy(this, "_openDialog"));
        this._form = null;
        if (this.options.fields == null) {
            this.options.fields = BB_CONFIG.defaults.bugentry_fields;
        }
        if (this.options.clone.length && this.options.bug == null) {
            this.options.clone = [];
        }
    },

    /**
     * Destroy the widget
     */
    destroy: function()
    {
        this.element.off("click", $.proxy(this, "_openDialog"));
        this._destroyDialog();
    },

    /**
     * Opens the bug entry dialog when element is clicked.
     */
    _openDialog: function() {
        if (this.options.mode == 'create') {
            var initial = {};
            var that = this;
            this.options.clone.forEach(function(field) {
                initial[field] = that.options.bug.value(field);
            });
            $.extend(initial, this.options.defaults);
            this._bug = new Bug(initial);
        } else {
            this._bug = this.options.bug;
        }
        if (this._form == null) {
            this._createForm();
            this._form.dialog({
                width: 800,
                title: this.options.title,
                position: ['center', 'top'],
                autoOpen: false,
                modal: true,
                buttons: {
                    "Save": $.proxy(this, '_saveBug'),
                    "Cancel": function (){$(this).dialog("close");}
                },
                close: $.proxy(this, '_destroyDialog')
            });
        }
        this._form.dialog("open");
        this._form.find("input:first").focus();
    },

    /**
     * Creates the bug entry form
     */
    _createForm: function() {
        if (this._form) return;
        this._form = $('<form class="bugentry">');
        var list = $('<ul>');
        this._form.append(list);

        // Create fields
        for (var i = 0; i < this.options.fields.length; i++) {
            if (this.options.fields[i] == '-') {
                list.append('<li class="separator"></li>');
                continue;
            }
            var field = this._bug.field(this.options.fields[i]);
            var input = this._bug.createInput(field, false, true);
            var item = $('<li class="'+field.name+'">')
                .append(this._bug.createLabel(field))
                .append(input);
            list.append(item);
        }
        // Add required but not shown fields
        var required = this._bug.requiredFields();
        for (var i=0; i < required.length; i++) {
            var field = required[i];
            if(this.options.fields.indexOf(field.name) != -1) continue;
            var input = this._bug.createInput(field, false, true);
            var item = $('<li class="'+field.name+'">')
                .append(this._bug.createLabel(field))
                .append(input);
            list.append(item);
        }
    },

    /**
     * Destroys the dialog
     */
    _destroyDialog: function() {
        if (this._form == null) return;
        this._bug = null;
        this._form.dialog("destroy");
        this._form.remove();
        this._form = null;
    },

    /**
     * Bug entry dialog save button handler
     */
    _saveBug: function() {
        var saving = this._bug.save()
        if (saving) {
            saving.done($.proxy(this, "_saveDone"));
        } else {
            this._destroyDialog();
        }
    },

    /**
     * Bug.save() done-callback handler
     */
    _saveDone: function(bug) {
        this._destroyDialog();
        this._trigger("success", null, { bug: bug, bug_id: bug.id });
    }
});

/**
 * Utility function to covert query string to parameter object
 *
 * @param query
 *      String in format "key=value&key=othervalue&foo=bar"
 *
 * @returns Object containing the paramters
 *      {key: ["value", "othervalue"], foo: "bar"}
 *      Values will be URI decoded
 */
function getQueryParams(query)
{
    var params = {};
    var regex = /([^=&\?]*)=([^&]*)/g;
    var match = null;
    while ((match = regex.exec(query)) != null) {
        var name = match[1];
        var value = decodeURIComponent(match[2]);
        if (params.hasOwnProperty(name)) {
            if (! $.isArray(params[name])) {
                params[name] = [params[name]];
            }
            params[name].push(value);
        } else {
            params[name] = value;
        }
    }
    return params;
}
/**
 * Utility function to convert parameter object ro query string
 *
 * @param params
 *      Object containing teh params
 *      { key: ["value", "othervalue"], foo: "bar" }
 *
 * @returns Query string
 *      "?key=value&key=othervalue&foo=bar"
 *      Values will be URI encoded
 */
function getQueryString(params)
{
    var query = "?"
    for (name in params) {
        var values = params[name];
        if (! $.isArray(values)) values = [values];
        for (var i = 0; i < values.length; i++) {
            query += "&" + name + "=" + encodeURIComponent(values[i]);
        }
    }
    return query;
}
