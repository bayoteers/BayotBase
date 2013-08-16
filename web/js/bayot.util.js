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
        console.error('absorb(): %o', e);
        throw e;
    }
}


/**
 * RPC object. Wraps the parameters of a Bugzilla RPC up along with callbacks
 * indicating completion state.
 */
var Rpc = Base.extend({
    /**
     * Create an instance.
     *
     * @param method
     *      Method name.
     * @param params
     *      Object containing method parameters.
     * @param immediate
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

        this.startedCb = jQuery.Callbacks();
        this.doneCb = jQuery.Callbacks();
        this.failCb = jQuery.Callbacks();
        this.completeCb = jQuery.Callbacks()

        // Fires on start; first argument is the RPC object.
        this.started = $.proxy(this.startedCb, "add");
        // Fires on success; first argument is the RPC result.
        this.done = $.proxy(this.doneCb, "add");
        // Fires on failure; first argument is the RPC failure object.
        this.fail = $.proxy(this.failCb, "add");
        // Always fires; first argument is this RPC object.
        this.complete = $.proxy(this.completeCb, "add");

        if(immediate !== false) {
            this.start();
        }
    },

    /**
     * Start the RPC.
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
            error: $.proxy(this, "_onError"),
        });

        this.startedCb.fire(this);
    },

    /**
     * Fired on success; records the RPC result and fires any callbacks.
     */
    _onSuccess: function(response)
    {
        this.response = response.result;
        var that = this;
        absorb(function()
        {
            that.doneCb.fire(response.result);
            that.completeCb.fire(that);
        });
    },

    /**
     * Fired on failure; records the error and fires any callbacks.
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
                code: -32603,
            };
        }
        if(typeof console !== 'undefined') {
            console.log('jsonRPC error: %o', this.error);
        }
        var that = this;
        absorb(function()
        {
            that.failCb.fire(that.error);
            that.completeCb.fire(that);
        });
    }
});


/**
 * Display a small progress indicator at the top of the document while any
 * jQuery XMLHttpRequest is in progress.
 */
var RpcProgressView = {
    _CSS_PROPS: {
        background: '#7f0000',
        color: 'white',
        padding: '0.5ex',
        position: 'fixed',
        top: 0,
        right: 0,
        'z-index': 9999999,
        'text-decoration': 'blink'
    },

    init: function()
    {
        if(this._progress) {
            return;
        }

        this._active = 0;
        this._progress = $('<div>Working..</div>');
        this._progress.css(this._CSS_PROPS);
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

    constructor: function(bug)
    {
        if (bug.id) {
            // TODO: Might need a better check of bug data completeness
            this.id = bug.id;
            this._data = $.extend(true, {}, bug);
            this._modified = {};
        } else {
            this.id = null;
            this._modified = $.extend(true, {}, bug);
            this._data = $.extend({}, BB_CONFIG.default);
        }
        // Holders for deffed objects
        this._fetching = null;

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
        if (!this.isModified()) return;
        if (this.id) {
            var rpc = new Rpc("Bug", "update",
                    this._getUpdateParams());
        } else {
            var rpc = new Rpc("Bug", "create", this._modified);
        }
        rpc.done($.proxy(this, "_saveDone"));
        rpc.fail($.proxy(this, "_saveFail"));
        this._saving = $.Deferred();
        return this._saving.promise()
    },

    _getUpdateParams: function()
    {
        var params = {ids: [this.id]};
        for (var name in this._modified) {
            var fd = Bug.fd(name);
            if (name == 'comment') {
                params[name] = {body: this._modified[name]};
                // TODO private comment support?
            } else if (fd.multivalue) {
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
                var fd = Bug.fd(name);
                var change = changes[name];
                if (fd.multivalue) {
                    if (!$.isArray(this._data[name])) this._data[name] = [];
                    var added = change.added ? change.added.split(/\s*,\s*/) : [];
                    var removed = change.removed ? change.removed.split(/\s*,\s*/) : [];
                    if (fd.type == Bug.FieldType.BUGID) {
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
        alert("Saving bug failed: " + error.message);
        if (this._saving) {
            this._saving.reject(this);
            this._saving = null;
        }
    },

    /**
     * Update bug data from database
     */
    update: function() {
        if (this._fetching) return this._fetching.promise();
        if (!this.id) throw "Can't update unsaved bug";
        var rpc = new Rpc("Bug", "get", {ids:[this.id]});
        rpc.done($.proxy(this, "_getDone"));
        rpc.fail($.proxy(this, "_getFail"));
        this._fetching = $.Deferred();
        return this._fetching.promise();
    },

    _getDone: function(result) {
        for (var name in result.bugs[0]) {
            this.set(name, result.bugs[0][name]);
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
        alert("Loading bug failed: " + error.message);
        if (this._saving) {
            this._saving.reject(this);
            this._saving = null;
        }
        if (this._fetching) {
            this._fetching.reject(this);
            this._fetching = null;
        }
    },

    value: function(name)
    {
        return this._modified[name] || this._data[name];
    },
    choices: function(name)
    {
        var fdesc = Bug.fd(name);
        if (fdesc == undefined) return [];
        var current = this._data[fdesc.name];
        var choices = [];
        if (fdesc.name == 'status') {
            fdesc.values.forEach(function(value) {
                if (value.name == current && value.can_change_to) {
                    choices = value.can_change_to.map(function(t) {return t.name});
                    return true;
                }
            });
            choices.unshift(current);
        } else {
            var visibleFor = fdesc.value_field ? this.value(fdesc.value_field) : null;
            fdesc.values.forEach(function(value) {
                if (visibleFor && value.visibility_values.indexOf(visibleFor) == -1)
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
        }
        return choices;
    },

    /**
     * Set bug field values
     *
     * set({ field_name: value, ...}) - to set multiple values
     *   or
     * set(field_name, value) - to set single value
     */
    set: function(name, value) {
        if(arguments.length == 1) {
            for (var key in name) {
                this.set(key, name[key]);
            }
            return;
        }
        var fdesc = Bug.fd(name);
        if (fdesc.immutable)
            return;
        var diff = false;
        if (fdesc.multivalue) {
            value = $.isArray(value) ? value : value.split(/\s*,\s*/);
            if (this._data[name] == undefined) this._data[name] = [];
            diff = value.sort().join() != this._data[name].sort().join;
        } else {
            diff = value != this._data[name];
        }
        if (diff){
            if (fdesc.type == Bug.FieldType.BUGID) {
                if(fdesc.multivalue) {
                    value = value.map(Number);
                } else {
                    value = Number(value);
                }
            }
            this._modified[name] = value;
            this._changedCb.fire(this, name, value);
            this._checkDependencies(fdesc, value);
        } else {
            delete this._modified[name];
            this._checkDependencies(fdesc, value);
        }
    },
    add: function(name, value) {
        var fdesc = Bug.fd(name);
        if (fdesc.type == Bug.FieldType.BUGID) {
            value = Number(value);
        }
        if (!fdesc.multivalue) {
            this.set(name, value);
            return;
        }
        if (!$.isArray(this._data[name])) this._data[name] = [];
        if (this.value(name).indexOf(value) == -1) {
            this._modified[name] = this.value(name).slice();
            this._modified[name].push(value);
            this._changedCb.fire(this, name, this._modified[name]);
            this._checkDependencies(fdesc, value);
        }
    },
    remove: function(name, value) {
        var fdesc = Bug.fd(name);
        if (fdesc.type == Bug.FieldType.BUGID) {
            value = Number(value);
        }
        if (!fdesc.multivalue) {
            this.set(name, value);
            return;
        }
        if (!$.isArray(this._data[name])) this._data[name] = [];
        var index = this.value(name).indexOf(value);
        if (index != -1) {
            this._modified[name] = this.value(name).slice();
            this._modified[name].splice(index, 1);
            this._changedCb.fire(this, name, this._data[name]);
            this._checkDependencies(fdesc, value);
        }
    },
    _checkDependencies: function(fdesc, value)
    {
        if (!Bug._depends[fdesc.name]) return;
        for (var i=0; i < Bug._depends[fdesc.name].length; i++) {
            var dname = Bug._depends[fdesc.name][i];
            var choices = this.choices(dname);
            if(choices.indexOf(this.value(dname)) == -1) {
                this.set(dname, choices[0]);
            }
            this._choicesCb.fire(this, fdesc.name, dname, choices);
        }
    },
    /**
     * Creates input element for given field
     *
     * @param field - field descriptor or name
     * @param hidden - if true, create hidden type input
     * @param connect - if true, connect change event to set bug field value
     */
    createInput: function(field, hidden, connect) {
        if (!$.isPlainObject(field)) {
            field = Bug.fd(field);
            if (field == undefined) return;
        }
        if (hidden) {
            var element = $('<input type="hidden"></input>');
        } else if (field.type == Bug.FieldType.SELECT ||
                field.type == Bug.FieldType.MULTI) {
            var element = $("<select></select>");
        } else if (field.type == Bug.FieldType.TEXT) {
            var element = $("<textarea></textarea>");
        } else {
            var element = $("<input></input>");
        }
        element.attr("name", field.name);

        if (element.is('select')) {
            if (field.type == Bug.FieldType.MULTI || field.multivalue) {
                element.attr('multiple', 'multiple');
            }
            this.setSelectOptions(element);
        } else {
            var value = this.value(field.name);
            value = value != undefined ? value : this.choices(field.name)[0];
            element.val(value);
        }

        if (field.type == Bug.FieldType.USER) {
            element.userautocomplete();
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
                        that.setSelectOptions(element);
                    }
                });
            }
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
    setSelectOptions: function(element)
    {
        if(!element.is('select')) return;
        element.empty();
        var name = element.attr('name');
        var current = this.value(name);
        if (!$.isArray(current)) current = [current];
        this.choices(name).forEach(function(value) {
            var option = $('<option>' + value + '</option>')
                .attr('value', value);
            if (current.indexOf(value) != -1) {
                option.attr('selected', 'selected');
                element.prepend(option);
            } else {
                element.append(option);
            }
        });
    },

}, {
    get: function(ids, callback)
    {
        var multiple = true;
        if (!$.isArray(ids)) {
            ids = [ids];
            multiple = false;
        }
        var rpc = new Rpc("Bug", "get", {ids: ids});
        rpc.done(function(result) {
            var bugs = [];
            for(var i=0; i < result.bugs.length; i++) {
                bugs.push(new Bug(result.bugs[i]));
            }
            if (!multiple) {
                bugs = bugs[0];
            }
            callback(bugs);
        });
        rpc.fail(function(error) {
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
        USER: 11,
        BOOLEAN: 12,
    },

    _rpc: null,

    fd: function(name)
    {
        var fdesc = BB_FIELDS[name] || BB_FIELDS[Bug._internal[name]];
        return fdesc;
    },

    /**
     * Get field descriptors for fields required in Bug.create() RPC.
     */
    requiredFields: function() {
        var required = [];
        for (var name in BB_FIELDS) {
            if (BB_FIELDS[name].is_mandatory) {
                required.push(BB_FIELDS[name]);
            }
        }
        return required;
    },

    _initFields: function() {
        // Field dependency map
        Bug._depends = {};
        // Field "internal" name map
        Bug._internal = {};
        for (var name in BB_FIELDS) {
            var fdesc = BB_FIELDS[name];
            if (fdesc.value_field) {
                if (Bug._depends[fdesc.value_field] == undefined)
                    Bug._depends[fdesc.value_field] = [];
                Bug._depends[fdesc.value_field].push(fdesc.name);
            }
            if (fdesc.name != fdesc.internal_name) {
                Bug._internal[fdesc.internal_name] = fdesc.name;
            }
        }
    },
});

Bug._initFields();

/**
 * User input field autocomplete widget
 */
$.widget("bb.userautocomplete", {
    /**
     * Initialize the widget
     */
    _create: function()
    {
        // Initialize autocomplete on the element
        this.element.autocomplete({
            minLength: 3,
            delay: 500,
            source: $.proxy(this, "_source"),
            focus: $.proxy(this, "_onItemFocus"),
            select: $.proxy(this, "_onItemSelect"),
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
        this.element.val(ui.item.name);
        return false;
    },

    /**
     * jQuery UI autocomplete item select handler
     */
    _onItemSelect: function(event, ui) {
        this.element.val(ui.item.name);
        return false;
    },

    /**
     * jQuery UI autocomplete data source function
     */
    _source: function(request, responce) {
        this._respCallback = responce;
        var terms = this._splitTerms(request.term.toLowerCase());

        var rpc = new Rpc("User", "get", {match:terms});
        rpc.done($.proxy(this, "_userGetDone"));
        rpc.complete($.proxy(this.spinner, "hide"));

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
    },
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
        clone: [],
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
            this.options.fields = BB_CONFIG.default.bugentry_fields;
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
                    "Cancel": function (){$(this).dialog("close");},
                },
                close: $.proxy(this, '_destroyDialog'),
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
            var fdesc = Bug.fd(this.options.fields[i]);
            var input = this._bug.createInput(fdesc, false, true);
            var item = $('<li class="'+fdesc.name+'">')
                .append($('<label>')
                        .attr("for", fdesc.name)
                        .text(fdesc.display_name)
                )
                .append(input);
            list.append(item);
        }
        // Add required but not shown fields
        var required = Bug.requiredFields();
        for (var i=0; i < required.length; i++) {
            var fdesc = required[i];
            if(this.options.fields.indexOf(fdesc.name) != -1) continue;
            var input = this._bug.createInput(fdesc, true, true);
            this._form.append(input);
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
    },
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
