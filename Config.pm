# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2012 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>
#
# The Initial Developer of the Original Code is David Wilson
# Portions created by the Initial Developer are Copyright (C) 2012 the
# Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   David Wilson <ext-david.3.wilson@nokia.com>

package Bugzilla::Extension::BayotBase;
use strict;

use constant NAME => 'BayotBase';

use constant REQUIRED_MODULES => [
    {
        package => 'JSON-RPC',
        module  => 'JSON::RPC',
        version => 0,
    },
    {
        package => 'Test-Taint',
        module  => 'Test::Taint',
        version => 0,
    },
];

use constant OPTIONAL_MODULES => [
];

__PACKAGE__->NAME;
