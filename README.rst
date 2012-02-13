BayotBase
---------

This extension supplements built-in Bugzilla functionality in various ways
useful to the BAYOT extensions.


Features
--------

    * Load jQuery, Base.js, jquery.jsonrpc.js on each page.

    * Provide a single parameter, 'bb_use_debug_js', which controls loading of
      debug JS libraries for all extensions.

    * Provide common navigation bar hooks.

    * Ensure Javascript runtime has newer features (e.g.
      Function.prototype.bind()).

    * Simple infrastructure for making Bugzilla JSON-RPC calls, and displaying
      a progress indicator while a call is in progress.


Requirements
------------

    Currently requires hooks for which a patch is supplied for Bugzilla 3.6.2.


Installation
------------

    Install Bugzilla as usual, copy the BayotBase directory to extensions, and
    then from the Bugzilla installation root, execute::

        patch -p1 < extensions/BayotBase/hooks_3.6.2.patch


