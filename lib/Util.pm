# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2013 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>

package Bugzilla::Extension::BayotBase::Util;
use strict;
use warnings;

use Bugzilla::Error;

use base qw(Exporter);

our @EXPORT = qw(
    cache_base_dir
    cache_timestamp
    cache_ts_file
    cache_user_file
    get_field_defs
);

use Bugzilla::Constants;
use Bugzilla::Component;
use Bugzilla::Keyword;
use Bugzilla::Milestone;
use Bugzilla::Status;
use Bugzilla::Util;

use Scalar::Util qw(blessed);

use constant PRODUCT_SPECIFIC => {
    version          => 1,
    target_milestone => 1,
    component        => 1,
};

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
        is_on_bug_entry => 0,
    },
    component => {
        is_on_bug_entry => 1,
        value_field => 'product',
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
        multivalue => 1,
        is_on_bug_entry => 1,
    },
    delta_ts => {
        name => 'last_change_time',
        immutable => 1,
    },
    op_sys => {
        is_on_bug_entry => 1,
        is_mandatory => Bugzilla->params->{defaultopsys} ? 0 : 1,
    },
    rep_platform => {
        name => 'platform',
        is_on_bug_entry => 1,
        is_mandatory => Bugzilla->params->{defaultplatform} ? 0 : 1,
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
    resolution => {
        visibility_field => 'status',
    },
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
        value_field => 'status'
    },
    short_desc => {
        name => 'summary',
        is_on_bug_entry => 1,
    },
    target_milestone => {
        is_on_bug_entry => 1,
        value_field => 'product',
    },
    bug_file_loc => {
        name => 'url',
        is_on_bug_entry => 1,
    },
    version => {
        type => 2,
        is_mandatory => 1,
        is_on_bug_entry => 1,
        value_field => 'product',
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

sub _generate_field_defs {
    my ($self, $user) = @_;
    $user ||= Bugzilla->user;

    my %fields;
    my $field_descs = template_var('field_descs');
    my %selectable_products = map {$_->id => $_}
                                  @{$user->get_selectable_products};

    foreach my $field (@{Bugzilla->fields}) {
        next unless $field->custom or defined FIELD_OVERRIDES->{$field->name};

        my @values;
        if ($field->name eq 'product') {
            foreach my $product (values %selectable_products) {
                push @values, {
                    name     => $product->name,
                    sort_key => 0,
                    visibility_values => [],
                    is_default => 0,
                    allows_unconfirmed => $product->allows_unconfirmed ? 1 : 0,
                };
            }
        } elsif ($field->name eq 'keywords') {
            foreach my $keyword (Bugzilla::Keyword->get_all) {
                push @values, {
                    name     => $keyword->name,
                    sort_key => 0,
                    visibility_values => [],
                    is_default => 0,
                };
            }
        } elsif (PRODUCT_SPECIFIC->{$field->name}) {
            my @list;
            if ($field->name eq 'version') {
                @list = Bugzilla::Version->get_all;
            }
            elsif ($field->name eq 'component') {
                @list = Bugzilla::Component->get_all;
            }
            else {
                @list = Bugzilla::Milestone->get_all;
            }
            foreach my $value (@list) {
                my $product = $selectable_products{$value->product_id};
                next unless defined $product;
                my $sortkey = $value->can('sortkey') ? $value->sortkey : 0;
                push @values, {
                    name => $value->name,
                    sort_key => $sortkey || 0,
                    visibility_values => [$product->name],
                    is_default => 0,
                };
            }
        } elsif ($field->name eq 'bug_status') {
            my %statuses;
            foreach my $value (@{$field->legal_values}) {
                foreach (@{$value->can_change_to}) {
                    $statuses{$_->name} ||= { visibility_values => [] };
                    push (@{$statuses{$_->name}->{visibility_values}},
                        $value->name)
                }
                $statuses{$value->name} ||= { visibility_values => [] };
                $statuses{$value->name}->{name} = $value->name;
                $statuses{$value->name}->{sort_key} = $value->sortkey;
                $statuses{$value->name}->{is_default} = 0;
            }
            @values = values %statuses;
        } elsif ($field->is_select) {
            foreach my $value (@{$field->legal_values}) {
                my $vis_val = $value->visibility_value;
                push @values, {
                    name => $value->name,
                    sort_key => $value->sortkey || 0,
                    visibility_values => [ defined $vis_val ?
                                           $vis_val->name : () ],
                    is_default => $value->is_default,
                };
            }
        }
        @values = sort {$a->{sort_key} <=> $b->{sort_key} ||
                        $a->{name} cmp $b->{name}} @values;

        my $visibility_field = $field->visibility_field
                             ? $field->visibility_field->name : undef;
        my $value_field = $field->value_field
                        ? $field->value_field->name : undef;
        my @visibility_values;
        if ($field->name eq 'resolution') {
            @visibility_values = map {$_->name} Bugzilla::Status::closed_bug_statuses()
        } else {
            @visibility_values = map { $_->name } @{$field->visibility_values};
        }

        my $name = FIELD_OVERRIDES->{$field->name}->{name} || $field->name;
        my $display_name = $field_descs->{$field->name} || $field->description;

        $fields{$name} = {
            name              => $name,
            internal_name     => $field->name,
            display_name      => $display_name,
            id                => scalar $field->id,
            is_custom         => $field->custom ? 1 : 0,
            values            => \@values,
            visibility_values => \@visibility_values,
            # OVERRIDABLE
            type              => FIELD_OVERRIDES->{$field->name}->{type} || $field->type,
            is_mandatory      => FIELD_OVERRIDES->{$field->name}->{is_mandatory} || $field->is_mandatory ? 1 : 0,
            is_on_bug_entry   => FIELD_OVERRIDES->{$field->name}->{is_on_bug_entry} || $field->enter_bug ? 1 : 0,
            value_field       => FIELD_OVERRIDES->{$field->name}->{value_field} || $value_field,
            visibility_field  => FIELD_OVERRIDES->{$field->name}->{visibility_field} || $visibility_field,
            # EXTRA
            immutable         => FIELD_OVERRIDES->{$field->name}->{immutable} || 0,
            multivalue        => FIELD_OVERRIDES->{$field->name}->{multivalue} ||
                                    $field->type == FIELD_TYPE_MULTI_SELECT,
        };
    }
    foreach (EXTRA_FIELDS) {
        $fields{$_->{name}} = $_;
    }

    return \%fields;
}

sub cache_base_dir {
    return bz_locations()->{'datadir'} . '/extensions/bayotbase_cache/';
}

sub cache_ts_file {
    my $filename = cache_base_dir().'lastupdate';
    # Make sure timestamp file exists
    -e $filename || open(my $fh, ">$filename") ||
            warn "Failed to create $filename: $!";
    return $filename;
}

sub cache_user_file {
    my $uid = shift;
    $uid = $uid->id if (blessed $uid);
    $uid ||= Bugzilla->user->id || 0;
    return cache_base_dir()."$uid.json";
}

sub cache_timestamp { return (stat cache_ts_file())[9] || time; }

sub get_field_defs {
    my %args = @_;
    my $cache_ts = cache_timestamp();
    my $as_json = $args{as_json} || 0;
    my $user = $args{user} || Bugzilla->user;

    my $fields = {};
    my $json_string = "{}";
    my $user_cache_file = cache_user_file($user);
    my $user_cache_ts = (stat($user_cache_file))[9] || 0;

    my $fh;
    if ($cache_ts > $user_cache_ts) {
        $fields = _generate_field_defs($user);
        $json_string = JSON->new->encode($fields);
        open($fh, ">$user_cache_file") and do {
            print $fh $json_string;
        } or warn "Failed to write $user_cache_file: $!";

    } else {
        open($fh, "<$user_cache_file") and do {
            $json_string = join('', <$fh>);
            $fields = JSON->new->decode($json_string) unless $as_json;
        } or do {
            warn "Failed to read $user_cache_file: $!";
            $fields = _generate_field_defs($user);
            $json_string = JSON->new->encode($fields) if $as_json;
        }
    }
    close $fh if defined $fh;
    return $as_json ? $json_string : $fields;
}

1;
