# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2012 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>
#
# The Initial Developer of the Original Code is "Nokia Corporation".
# Portions created by the Initial Developer are Copyright (C) 2011 the
# Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   David Wilson <ext-david.3.wilson@nokia.com>

package Bugzilla::Extension::BayotBase::Config;
use strict;
use warnings;

use Bugzilla::Config::Common;

sub get_param_list {
    my ($class) = @_;

    my @params = (
        {
            name   => 'bb_use_debug_js',
            type   => 'b',
            default => 0,
        },
        {
            name   => 'bb_bug_entry_fields',
            type   => 't',
            default => 'summary product component severity priority comment',
        },
    );
    return @params;
}

1;
