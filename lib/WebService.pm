# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# The contents of this file are subject to the Mozilla Public
# License Version 1.1 (the "License"); you may not use this file
# except in compliance with the License. You may obtain a copy of
# the License at http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS
# IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
# implied. See the License for the specific language governing
# rights and limitations under the License.
#
# The Original Code is the AgileTools Bugzilla Extension.
#
# The Initial Developer of the Original Code is Pami Ketolainen
# Portions created by the Initial Developer are Copyright (C) 2012 the
# Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Pami Ketolainen <pami.ketolainen@jollamobile.com>

=head1 NAME

Bugzilla::Extension::BayotBase::WebService

=head1 DESCRIPTION

Webservice methods for BayotBase extension

=cut

use strict;
use warnings;

package Bugzilla::Extension::BayotBase::WebService;

use base qw(Bugzilla::WebService);

use Bugzilla::WebService::Bug;
use Bugzilla::Util;

use constant RPC_FIELDS => qw(
    product
    component
    version
    summary
    description
    op_sys
    platform
    priority
    severity
    alias
    assigned_to
    cc
    qa_contact
    status
    estimated_time
    blocked
    dependson
);

use constant PRODUCT_SPECIFIC_FIELDS => qw(version target_milestone component);

use constant FIELD_RPC_MAP => {
    rep_platform => 'platform',
    bug_severity => 'severity',
    bug_status   => 'status',
    longdesc     => 'description',
    short_desc   => 'summary',
};

BEGIN {
  # USe _legal_field_values from Webservice::Bug
  *_legal_field_values = \&Bugzilla::WebService::Bug::_legal_field_values;
}

=head1 METHODS

=head2 fields

=cut


sub fields {
    my $self = shift;
    my @fields;
    my $field_descs = template_var('field_descs');
    foreach my $field (@{Bugzilla->fields}) {
        my $name = FIELD_RPC_MAP->{$field->name} || $field->name;
        next unless $field->custom or
            grep($_ eq $name, RPC_FIELDS);

        my @values;
        if ($field->name eq 'product') {
            foreach my $product (@{Bugzilla->user->get_enterable_products}) {
                push @values, {
                    name     => $self->type('string', $product->name),
                    sort_key => $self->type('int', 0),
                    sortkey  => $self->type('int', 0), # deprecated
                    visibility_values => [],
                };
            }
        } elsif ($field->is_select or grep($_ eq $field->name, PRODUCT_SPECIFIC_FIELDS)) {
             @values = @{ $self->_legal_field_values({ field => $field }) };
        }

        my $visibility_field = $field->visibility_field
                             ? $field->visibility_field->name : undef;
        my $value_field = $field->value_field
                        ? $field->value_field->name : undef;
        if (grep($_ eq $field->name, PRODUCT_SPECIFIC_FIELDS)) {
            $value_field = 'product';
        }
        my $display_name = $field_descs->{$field->name} || $field->description;

        push @fields, {
            name              => $self->type('string', $name),
            original_name     => $self->type('string', $field->name),
            display_name      => $self->type('string', $display_name),
            id                => $self->type('int', $field->id),
            type              => $self->type('int', $field->type),
            is_custom         => $self->type('boolean', $field->custom),
            is_mandatory      => $self->type('boolean', $field->is_mandatory),
            is_on_bug_entry   => $self->type('boolean', $field->enter_bug),
            value_field       => $self->type('string', $value_field),
            values            => \@values,
            visibility_field  => $visibility_field,
            visibility_values => [ map { $_->name } @{$field->visibility_values} ]
        };
    }
    return { fields => \@fields };
}
1;

__END__

=head1 SEE ALSO

L<Bugzilla::Extension::AgileTools::WebService::Team>
