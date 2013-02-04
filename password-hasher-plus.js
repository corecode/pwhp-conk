/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Password Hasher Plus
 *
 * The Initial Developer of the Original Code is Eric Woodruff.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): (none)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var password_hasher_plus = {
    // from https://developer.mozilla.org/en-US/docs/XUL/School_tutorial/Appendix_D:_Loading_Scripts
    base_dir: Components.stack.filename
        .replace(/.* -> |[^\/]+$/g, ""),
    file_url: function(name) { return this.base_dir + name; },

    scripts: [
        "jquery-1.9.0.min.js",
        "jquery.qtip.min.js",
        "content-script.js"
    ],

    prefs: Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService)
        .getBranch("extensions.password_hasher_plus."),

    get_config: function(fields, defaultval) {
        var path = fields.join('.');
        var res = defaultval;
        try {
            res = this.prefs.getCharPref(path);
        } catch (e) {
            if (typeof defaultval !== 'undefined')
                return defaultval;
            path = ['defaults', fields[fields.length - 1]].join('.');
            res = this.prefs.getCharPref(path);
        }
        return res;
    },

    set_config: function(fields, val) {
        var path = fields.join('.');
        this.prefs.setCharPref(path, val);
    },

    generateGuid: function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace (/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        }).toUpperCase();
    },

    bump: function(tag) {
        var re = new RegExp("^([^:]+?)(:([0-9]+))?$");
        var compatible = false;
        if (tag.startsWith("compatible:")) {
	    tag = tag.substringAfter("compatible:");
	    compatible = true;
        }
        var matcher = re.exec(tag);
        var bump = 1;
        if (matcher[3] != null) {
	    tag = matcher[1];
	    bump += parseInt(matcher[3]);
        }
        if (compatible) {
	    tag = "compatible:" + tag;
        }
        return tag + ":" + bump;
    },

    Set: function(data, callback) {
        for (var i in data) {
            if (data != "")
                this[data[i]] = true;
        }
        this.__proto__ = {
            add: function(d) { this[d] = true; this.updated(); },
            remove: function(d) { delete this[d]; this.updated(); },
            updated: function() { if (callback) callback(Object.keys(this)); }
        };
    },

    // loaded below
    SHA1: {},

    attach: function(event) {
        // this is the element receiving the event
        var document = event.originalTarget;
        var pwhash = new password_hasher_plus.Instance(document);
    },

    Instance: function(document) {
        this.document = document;
        this.window = this.document.defaultView;
        this.console = {log: conkeror.dumpln};
        this.window.password_hasher_plus = this;

        this.url = document.URL;

        this.content_script = {
            __proto__: this.window,
            pwhash: this
        };
        try {
            for (var i in password_hasher_plus.scripts) {
                var script = password_hasher_plus.scripts[i];
                conkeror.load_url(password_hasher_plus.file_url(script),
                                  this.content_script);
            }
        } catch (e) {
            this.console.log(e);
        }
    }
};
conkeror.load_url(password_hasher_plus.file_url("passhashcommon.js"), password_hasher_plus);
conkeror.load_url(password_hasher_plus.file_url("sha1.js"), password_hasher_plus.SHA1);

password_hasher_plus.Instance.prototype = {
    generateHash: function(input) {
        var salt = this.tag;

        if (this.seed != null) {
            salt = password_hasher_plus.PassHashCommon.generateHashWord(
                this.seed,
                salt,
                24,
                true, // require digits
                true, // require punctuation
                true, // require mixed case
                false, // no special characters
                false // only digits
            );
        }

        return password_hasher_plus.PassHashCommon.generateHashWord(
            salt,
            input,
            this.length,
            true, // require digits
            this.strength > 1, // require punctuation
            true, // require mixed case
            this.strength < 2, // no special characters
            this.strength == 0 // only digits
        );
    },

    get site() {
        //^(?:[^.]+\.){0,1}((?:[^.]+\.)*(?:[^.]+))\.(?:[^.]{2,15})$
        //http://www.regexplanet.com/simple/index.html
        var reg = new RegExp("^https?://(?:([^:\\./ ]+?)|([0-9]{1,3}(?:\\.[0-9]{1,3}){3})|(?:[^:./ ]+\\.){0,1}((?:[^:./ ]+\\.)*(?:[^:. /]+))\\.(?:[^:. /]{2,15}))(?::\\d+)?/.*$");
        var m = reg.exec(this.url);
        try {
            for (var i = 0; i < 3; ++i) {
                if (m[i+1] != null) {
		    this.console.log("grepurl: " + this.url + " = " + m[i+1]);
                    return m[i+1];
                }
            }
            throw "unmatched";
        } catch (e) {
            return "chrome";
        }
    },


    // storage business

    get_site_config: function(field, defaultval) { return password_hasher_plus.get_config(['site', this.site, field], defaultval); },
    set_site_config: function(field, val) { password_hasher_plus.set_config(['site', this.site, field], val); },
    get tag() { return this.get_site_config('tag', this.site); },
    set tag(val) { this.set_site_config('tag', val); },

    get fields() {
        var pwhash = this;
        var data = this.get_site_config('fields', "").split(/ +/);
        var set = new password_hasher_plus.Set(data, function(val) {
            pwhash.set_site_config('fields', val.join(' '));
        });
        return set;
    },

    get_tag_config: function(field) { return password_hasher_plus.get_config(['tag', this.tag, field]); },
    set_tag_config: function(field, val) { password_hasher_plus.set_config(['tag', this.tag, field], val); },
    get seed() { return this.get_tag_config('seed'); },
    set seed(val) { this.set_tag_config('seed', val); },
    get length() { return +this.get_tag_config('length'); },
    set length(val) { this.set_tag_config('length', ""+val); },
    get strength() { return +this.get_tag_config('strength'); },
    set strength(val) { this.set_tag_config('strength', ""+val); },

    save: function() {
        // trigger setters; some data might have been from defaults
        this.tag = this.tag;
        this.fields = this.fields;
        this.seed = this.seed;
        this.length = this.length;
        this.strength = this.strength;
    }
};

function password_hasher_plus_add_listener(buffer) {
    if (buffer instanceof content_buffer) {
        buffer.browser.addEventListener("DOMContentLoaded",
                                        password_hasher_plus.attach,
                                        false);
    }
}

if (!password_hasher_plus.prefs.getPrefType('defaults.seed'))
    password_hasher_plus.set_config(['defaults', 'seed'], password_hasher_plus.generateGuid());
if (!password_hasher_plus.prefs.getPrefType('defaults.length'))
    password_hasher_plus.set_config(['defaults', 'length'], 16);
if (!password_hasher_plus.prefs.getPrefType('defaults.strength'))
    password_hasher_plus.set_config(['defaults', 'strength'], 2);

provide("password-hasher-plus");
