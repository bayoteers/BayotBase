/**
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "License"); you may not use this file
 * except in compliance with the License. You may obtain a copy of
 * the License at http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * rights and limitations under the License.
 *
 * The Original Code is BAYOT.
 *
 * The Initial Developer of the Original Code is "Nokia Corporation"
 * Portions created by the Initial Developer are Copyright (C) 2011 the
 * Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   David Wilson <ext-david.3.wilson@nokia.com>
 *   Pami Ketolainen <pami.ketolainen@gmail.com>
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
        this.error = response.error;
        if(typeof console !== 'undefined') {
            console.log('jsonRPC error: %o', this.error);
        }
        var that = this;
        absorb(function()
        {
            that.failCb.fire(response.error);
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


BB_FIELDS = {
    /**
     * Map for field names which do not match between Bug.create() params and
     * Bug.fields() return value
     */
    _rpc_map: {
        rep_platform: 'platform',
        bug_severity: 'severity',
        bug_status: 'status',
        longdesc: 'description',
        short_desc: 'summary',
    },
    _default_field_desc: {
        required: false,
        type: 'string',
        is_list: false,
    },
    /**
     * Field descriptors for RPC interface
     */
    _fields: {
        product:        {required: true, type: 'select'},
        component:      {required: true, type: 'select'},
        version:        {required: true, type: 'select'},
        summary:        {required: true},
        description:    {type: 'text'},
        op_sys:         {type: 'select'},
        platform:       {type: 'select'},
        priority:       {type: 'select'},
        severity:       {type: 'select'},
        alias:          {},
        assigned_to:    {type: 'user' },
        cc:             {type: 'user', is_list: true},
        qa_contact:     {type: 'user' },
        status:         {type: 'select'},
        estimated_time: {type: 'number'},
        blocked:        {type: 'number', is_list: true},
        dependson:      {type: 'number', is_list: true},
    },

    _types: ['string','string','select','multiselect','text','datetime','bugid'],
    _fetch: $.Deferred(),
    _rpc: null,

    /**
     * Get field descriptors for fields required in Bug.create() RPC.
     */
    get_required: function() {
        var required = [];
        for (var name in BB_FIELDS._fields) {
            if (BB_FIELDS._fields[name].required) {
                required.push(BB_FIELDS[name]);
            }
        }
        return required;
    },

    init: function() {
        if (BB_FIELDS._rpc == null) {
            BB_FIELDS._rpc = new Rpc("BayotBase", "fields");
            BB_FIELDS._rpc.done(BB_FIELDS._processFields);
            BB_FIELDS._rpc.fail(function(error) {
                BB_FIELDS._rpc = null;
                BB_FIELDS._fetch = $.Deferred();
                alert("Failed to get bug fields: " + error.message);
            });
        }
        return BB_FIELDS._fetch.promise();
    },
    wrap: function(fn, fnThis)
    {
        return function() {
            var args = [].slice.apply(arguments);
            BB_FIELDS.init().done(function() {
                fn.apply(fnThis, args);
            });
        };
    },

    /**
     * Handle BayotBase.fields() RPC result
     * Stores the field data in
     */
    _processFields: function(result) {
        for (var i = 0; i < result.fields.length; i++) {
            var field = result.fields[i];
            if (field.is_custom && field.is_on_bug_entry) {
                var desc = {
                    required: field.is_mandatory,
                    type: BB_FIELDS._types[field.type] || 'string',
                };
            } else {
                var desc = BB_FIELDS._fields[field.name];
                if (desc == null) continue;
            }
            BB_FIELDS[field.name] = $.extend(
                    field,
                    BB_FIELDS._default_field_desc,
                    desc
                );
        }
        BB_FIELDS._fetch.resolve();
    },
};


/**
 * Bug entry widget
 */
$.widget("bb.bugentry", {
    /**
     * Default options
     */
    options: {
        fields: ['summary', 'product', 'component', 'severity', 'priority', 'description'],
        title: 'Create bug',
        defaults: {},
    },

    /**
     * Initialize the widget
     */
    _create: function()
    {
        this._openDialog = BB_FIELDS.wrap(this._openDialog, this);
        // Set click handler
        this.element.on("click", $.proxy(this, "_openDialog"));
        this._form = null;
    },

    /**
     * Destroy the widget
     */
    destroy: function()
    {
        this.element.off("click", $.proxy(this, "_openDialog"));
        if (this._form != null) {
            this._form.dialog("destroy");
        }
    },

    /**
     * Opens the bug entry dialog when element is clicked.
     * Fetches the required bug field information if it's not fetched yet.
     */
    _openDialog: function() {
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
                close: $.proxy(this, '_resetDialog'),
            });
        }
        this._form.dialog("open");
    },

    /**
     * Creates the bug entry form
     */
    _createForm: function() {
        if (this._form) {
            this._form.remove();
        }
        this._form = $('<form></form>');
        var table = $('<table></table>');
        this._form.append(table);
        this._depends = {};

        // Create fields
        for (var i = 0; i < this.options.fields.length; i++) {
            var fdesc = BB_FIELDS[this.options.fields[i]];
            var row = $('<tr></tr>');
            row.append(
                $('<th></th>').append(
                    $('<label></label>')
                        .attr("for", fdesc.name)
                        .text(fdesc.display_name)
                )
            );
            var input = this._createInput(fdesc);
            row.append($('<td></td>').append(input));
            table.append(row);
            if (fdesc.value_field) {
                if (!this._depends[fdesc.value_field])
                    this._depends[fdesc.value_field] = [];
                this._depends[fdesc.value_field].push(fdesc.name);
            } else if (input[0].tagName == 'SELECT') {
                this._setSelectOptions(input);
            }
        }
        // Add required but not shown fields
        var required = BB_FIELDS.get_required();
        for (var i=0; i < required.length; i++) {
            var fdesc = required[i];
            if(this.options.fields.indexOf(fdesc.name) != -1) continue;
            var input = this._createInput(fdesc, true);
            if (fdesc.value_field) {
                if (!this._depends[fdesc.value_field])
                    this._depends[fdesc.value_field] = [];
                this._depends[fdesc.value_field].push(fdesc.name);
            } else {
                input.val(BB_CONFIG.default[fdesc.name] || "unspecified");
            }
            this._form.append(input);
        }

        // Link value fields change to update and populate depending fields
        for (var vfname in this._depends) {
            this._form.find('select[name="'+vfname+'"]')
                .change($.proxy(this, "_updateSelects"));
        }
        this._updateSelects();
    },

    /**
     * Creates input element for given field
     */
    _createInput: function(field, hidden) {
        var element;
        if(hidden) {
            var element = $('<input type="hidden"></input>');
        } else if (field.type == 'select' || field.type == 'multiselect') {
            var element = $("<select></select>");
        } else if (field.type == 'text') {
            var element = $("<textarea></textarea>")
                .attr('rows', 10).attr('cols', 80);
        } else {
            var element = $("<input></input>");
        }
        element.attr("name", field.name)
            .data("updateFields", []);
        element.val(this.options.defaults[field.name] || BB_CONFIG.default[field.name]);

        if (field.type == 'user') {
            element.userautocomplete();
        }
        if (field.type == 'multiselect') {
            element.attr('multiple', 'multiple');
        }
        return element;
    },

    /**
     * Populate select box with options, optionally filtering by given display value
     */
    _setSelectOptions: function(element, display_value)
    {
        element.empty();
        var fname = element.attr('name');
        var hidden = element.attr('type') == 'hidden';
        var values = BB_FIELDS[fname].values || [];
        for (var i=0; i < values.length; i++) {
            var vdef = values[i];
            if (display_value &&
                    vdef.visibility_values.indexOf(display_value) == -1)
                continue;
            if(hidden) {
                element.val(vdef.name);
                break;
            }
            var option = $('<option>' + vdef.name + '</option>')
                .attr('value', vdef.name);
            var selected = this.options.defaults[fname] || BB_CONFIG.default[fname];
            if (vdef.name == selected)
                option.attr('selected', 'selected');
            element.append(option);
        }
    },

    /**
     * Update selec box options when parent changes.
     * Or all child selection if not called on change event.
     */
    _updateSelects: function(ev) {
        var changed = [];
        if (ev == undefined) {
            for (var fname in this._depends) {
                changed.push(fname);
            }
        } else {
            changed.push($(ev.target).attr('name'));
        }
        for (var i=0; i < changed.length; i++) {
            var updateFields = this._depends[changed[i]] || [];
            var newValue = this._form.find('[name=' + changed[i] +']').val();
            for (var i=0; i < updateFields.length; i++) {
                var field = this._form.find('[name=' + updateFields[i] + ']');
                this._setSelectOptions(field, newValue);
            }
        }
    },

    /**
     * Sets the initial values in bug entry dialog
     */
    _resetDialog: function() {
        if (this._form == null) return;
        this._form.dialog("destroy");
        this._form = null;
        return;
        // TODO Find out why hidden fields loose their value on reset
        // so that we don't need to recreate the form every time
        this._updateSelects();
        this._form.find("input,textarea").each(function() {
            var element = $(this);
            var value = BB_CONFIG.default[element.attr('name')] || "";
            element.val(value);
        });
    },

    /**
     * Bug entry dialog save button handler
     */
    _saveBug: function() {
        var params = {};
        fields = this._form.serializeArray();
        for (var i=0; i < fields.length; i++) {
            var field = fields[i];
            params[field.name] = field.value;
        }
        var rpc = new Rpc("Bug", "create", params);
        rpc.complete($.proxy(this, "_createComplete"));
    },
    /**
     * Bug.create() response handler, triggers success or fail event on the widget
     */
    _createComplete: function(rpc) {
        if (rpc.error) {
            this._trigger("fail", null, { error: rpc.error });
            alert("Failed to create bug: " + rpc.error.message);
        } else {
            this._resetDialog();
            this._trigger("success", null, { bug_id: rpc.response.id });
        }
    },
});
