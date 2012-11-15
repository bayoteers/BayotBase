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

    * Javascript library providing common Bugzilla related stuff
      
        - Bug class for easy creation, loading and updating bugs via JSON-RPC

        - jQuery bugentry widget for common bug create/edit dialog

        - jQuery userautocomplete widget


Requirements
------------

    Bugzilla 4.2 or later


Installation
------------

    Place the files under 'extensions/BayotBase' directory and run 'checksetup.pl'


