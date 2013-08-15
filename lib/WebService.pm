# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2012 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>

=head1 NAME

Bugzilla::Extension::BayotBase::WebService

=head1 DESCRIPTION

Webservice methods for BayotBase extension

=cut

use strict;
use warnings;

package Bugzilla::Extension::BayotBase::WebService;

use base qw(Bugzilla::WebService);

use Bugzilla::Extension::BayotBase::Util qw(get_field_defs);

use constant RPC_TYPES => {
    is_custom         => 'boolean',
    internal_name     => 'string',
    display_name      => 'string',
    id                => 'int',
    value_field       => 'string',
    visibility_field  => 'string',
    name              => 'string',
    type              => 'int',
    is_mandatory      => 'boolean',
    is_on_bug_entry   => 'boolean',
    immutable         => 'boolean',
    multivalue        => 'boolean',
};

=head1 METHODS

=head2 fields

=cut

sub fields {
    my $self = shift;
    my @fields = values %{get_field_defs()};

    foreach my $field (@fields) {
        my ($key, $type);
        while (($key, $type) = each(%{RPC_TYPES()})) {
            $field->{$key} = $self->type($type, $field->{$key});
        }
    }
    return { fields => \@fields };
}
1;

__END__

