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

use Bugzilla::Keyword;
use Bugzilla::WebService::Bug;
use Bugzilla::Util;

use constant PRODUCT_SPECIFIC_FIELDS => qw(version target_milestone component);

use constant FIELD_OVERRIDES => {
    alias => {
        type => 1,
        is_on_bug_entry => 1,
    },
    assigned_to => {
        type => 11, # USER
        is_on_bug_entry => 1,
    },
    blocked => {
        name => 'blocks',
        type => 6,
        multivalue => 1,
        is_on_bug_entry => 1,
    },
    cc => {
        type => 11,
        multivalue => 1,
        is_on_bug_entry => 1,
    },
    classification => {
        immutable => 1,
        is_on_bug_entry => 1,
    },
    component => {
        is_on_bug_entry => 1,
    },
    longdesc => {
        name => 'comment',
        type => 4,
        is_on_bug_entry => 1,
    },
    creation_ts => {
        name => 'creation_time',
        immutable => 1,
        is_on_bug_entry => 1,
        # It's a datetime, but as immutable the type doesn't matter
    },
    reporter => {
        name =>'creator',
        type => 11,
        immutable => 1,
    },
    deadline => {
        is_on_bug_entry => 1,
    },
    dependson => {
        name => 'depends_on',
        type => 6,
        is_on_bug_entry => 1,
        multivalue => 1,
    },
    estimated_time => {
        is_on_bug_entry => 1,
    },
    bug_group => {
        name => 'groups',
        type => 0,
        multivalue => 1,
        is_on_bug_entry => 1,
        # Should this be multiselect?
        # Would require resolving the available groups
    },
    bug_id => {
        name => 'id',
        type => 6,
        immutable => 1,
    },
    cclist_accessible => {
        name => 'is_cc_accessible',
        type => 12, # BOOLEAN
        is_on_bug_entry => 1,
    },
    reporter_accessible => {
        name => 'is_creator_accessible',
        type => 12,
        is_on_bug_entry => 1,
    },
    keywords => {
        type => 3,
        multivalue => 1,
        is_on_bug_entry => 1,
        # There is keywords type, but this should work like regural multiselect
    },
    delta_ts => {
        name => 'last_change_time',
        immutable => 1,
    },
    op_sys => {
        is_on_bug_entry => 1,
    },
    rep_platform => {
        name => 'platform',
        is_on_bug_entry => 1,
    },
    priority => {
        is_on_bug_entry => 1,
    },
    product => {
        is_on_bug_entry => 1,
    },
    qa_contact => {
        type => 11,
        is_on_bug_entry => 1,
    },
    remaining_time => {
        is_on_bug_entry => 1,
    },
    resolution => {},
    see_also => {
        multivalue => 1,
    },
    bug_severity => {
        name => 'severity',
        is_on_bug_entry => 1,
    },
    bug_status => {
        name => 'status',
        is_on_bug_entry => 1,
    },
    short_desc => {
        name => 'summary',
        is_on_bug_entry => 1,
    },
    target_milestone => {
        is_on_bug_entry => 1,
    },
    bug_file_loc => {
        name => 'url',
        is_on_bug_entry => 1,
    },
    version => {
        type => 2,
        is_mandatory => 1,
        is_on_bug_entry => 1,
    },
    status_whiteboard => {
        name => 'whiteboard',
        is_on_bug_entry => 1,
    },
    work_time => {},
};

use constant EXTRA_FIELDS => (
# Not in fields() result
    {
        id => 0,
        name => 'dupe_of',
        internal_name => 'dup_id',
        is_custom => 0,
        is_mandatory => 0,
        is_on_bug_entry => 0,
        type => 6,
        visibility_field => undef,
        visiblity_values => [],
        values => [],
    },
    {
        id => 0,
        name => 'is_confirmed',
        internal_name => undef,
        display_name => 'Confirmed',
        is_custom => 0,
        is_mandatory => 0,
        is_on_bug_entry => 0,
        immutable => 1,
        type => 12,
        visibility_field => undef,
        visiblity_values => [],
        values => [],
    },
    {
        id => 0,
        name => 'is_open',
        internal_name => undef,
        display_name => 'Open',
        is_custom => 0,
        is_mandatory => 0,
        is_on_bug_entry => 0,
        immutable => 1,
        type => 12,
        visibility_field => undef,
        visiblity_values => [],
        values => [],
    },
    {
        id => 0,
        name => 'update_token',
        internal_name => undef,
        display_name => 'Update Token',
        is_custom => 0,
        is_mandatory => 0,
        is_on_bug_entry => 0,
        immutable => 1,
        type => 0,
        visibility_field => undef,
        visiblity_values => [],
        values => [],
    },
    {
        id => 0,
        name => 'actual_time',
        internal_name => undef,
        display_name => 'Actual Hours',
        is_custom => 0,
        is_mandatory => 0,
        is_on_bug_entry => 0,
        immutable => 1,
        type => 0,
        visibility_field => undef,
        visiblity_values => [],
        values => [],
    },
);

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
        next unless $field->custom or defined FIELD_OVERRIDES->{$field->name};

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
        } elsif ($field->name eq 'keywords') {
            foreach my $keyword (Bugzilla::Keyword->get_all) {
                push @values, {
                    name     => $self->type('string', $keyword->name),
                    sort_key => $self->type('int', 0),
                    sortkey  => $self->type('int', 0), # deprecated
                    visibility_values => [],
                };
            }
        } elsif ($field->is_select or grep($_ eq $field->name, PRODUCT_SPECIFIC_FIELDS)) {
             @values = @{ $self->_legal_field_values({ field => $field }) };
        }
        # TODO: fetch available keywords

        my $visibility_field = $field->visibility_field
                             ? $field->visibility_field->name : undef;
        my $value_field = $field->value_field
                        ? $field->value_field->name : undef;
        if (grep($_ eq $field->name, PRODUCT_SPECIFIC_FIELDS)) {
            $value_field = 'product';
        }
        my $display_name = $field_descs->{$field->name} || $field->description;

        my %field_data = (
            is_custom         => $field->custom,
            internal_name     => $field->name,
            display_name      => $display_name,
            id                => $field->id,
            value_field       => $value_field,
            values            => \@values,
            visibility_field  => $visibility_field,
            visibility_values => [ map { $_->name } @{$field->visibility_values} ],
            # OVERRIDABLE
            name              => FIELD_OVERRIDES->{$field->name}->{name} || $field->name,
            type              => FIELD_OVERRIDES->{$field->name}->{type} || $field->type,
            is_mandatory      => FIELD_OVERRIDES->{$field->name}->{is_mandatory} || $field->is_mandatory,
            is_on_bug_entry   => FIELD_OVERRIDES->{$field->name}->{is_on_bug_entry} || $field->enter_bug,
            # EXTRA
            immutable         => FIELD_OVERRIDES->{$field->name}->{immutable} || 0,
            multivalue        => FIELD_OVERRIDES->{$field->name}->{multivalue} || 0,
        );
        push @fields, \%field_data;
    }
    push @fields, EXTRA_FIELDS;

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

=head1 SEE ALSO

L<Bugzilla::Extension::AgileTools::WebService::Team>
