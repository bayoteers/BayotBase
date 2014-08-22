# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2012 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>
#
# The Initial Developer of the Original Code is Nokia. Portions created by the
# Initial Developer are Copyright (C) 2012 Nokia. All Rights Reserved.
#
# Contributor(s):
#   David Wilson <ext-david.3.wilson@nokia.com>

package Bugzilla::Extension::BayotBase;

use strict;
use JSON;
use base qw(Bugzilla::Extension);

use Bugzilla::Hook;
use Bugzilla::Install::Filesystem;
use Bugzilla::Extension::BayotBase::Util;

our $VERSION = '0.01';


# Invoke the bb_common_links hook, aggregating returned menu items into a
# bb_common_links variable, for hook/global/common-links-link-row.html.tmpl
sub _build_common_links {
    my ($args, $vars, $file) = @_;

    my %links;
    Bugzilla::Hook::process('bb_common_links', {
        args => $args,
        vars => $vars,
        file => $file,
        links => \%links
    });

    my @items;
    while(my ($section, $section_items) = each(%links)) {
        push @items, @$section_items;
    }

    $vars->{bb_common_links} = [ sort
        { ($a->{priority} || 999) <=> ($b->{priority} || 999)
            or ($a->{text} cmp $b->{text}) } @items
    ];
}

# Invoke bb_group_params and add group identifiers on the admin group listing
# page
sub _group_identifiers {
    my $vars = shift;
    my $group_params = [];
    Bugzilla::Hook::process('bb_group_params', {group_params => $group_params});
    $vars->{overrides}->{action}->{name} ||= {};
    my $overrides = $vars->{overrides}->{action}->{name};
    for my $param (@$group_params) {
        my $groups = Bugzilla->params->{$param};
        next unless $groups;
        $groups = [$groups] if (ref $groups ne 'ARRAY');
        for my $group (@$groups) {
            $overrides->{$group} ||= {override_content => 1, content => ''};
            $overrides->{$group}->{content} .= ', '
                if $overrides->{$group}->{content};
            $overrides->{$group}->{content} .= $param;
        }
    }
}

# Create a JSON object containing various useful Bugzilla runtime information.
sub _make_bb_config {
    my ($args, $vars, $file) = @_;

    my $user = Bugzilla->user;
    my $config = {};
    if($user->id) {
        $config->{user} = {
            logged_in => JSON::true,
            login => $user->login,
            real_name => $user->name,
            email => $user->email,
            id => $user->id,
            groups => [ sort map { $_->{name} } @{$user->groups} ],
            enterable_products => [
                sort map { $_->{name} } @{$user->get_enterable_products}
            ],
        };
    } else {
        $config->{user} = {
            logged_in => JSON::false,
            groups => [],
            enterable_products => [],
        };
    }
    $config->{defaults} = {
        bugentry_fields => [split(/\s/,
            Bugzilla->params->{'bb_bug_entry_fields'})],
        priority => Bugzilla->params->{'defaultpriority'},
        severity => Bugzilla->params->{'defaultseverity'},
        platform => Bugzilla->params->{'defaultplatform'},
        op_sys => Bugzilla->params->{'defaultopsys'},
    };

    $vars->{bb_config} = JSON->new->encode($config);
}

sub install_filesystem {
    my ($self, $args) = @_;
    my $cache = cache_base_dir();
    $args->{create_dirs}->{$cache} =
            Bugzilla::Install::Filesystem::DIR_CGI_WRITE;
    $args->{recurse_dirs}->{$cache} = {
        dirs => Bugzilla::Install::Filesystem::DIR_CGI_WRITE,
        files => Bugzilla::Install::Filesystem::CGI_WRITE,
    };
}

sub _validate_fielddefs_cache {
    my $obj = shift;
    if ($obj->isa('Bugzilla::Field') ||
        $obj->isa('Bugzilla::Field::ChoiceInterface') ||
        $obj->isa('Bugzilla::Keyword') ||
        $obj->isa('Bugzilla::Version') ||
        $obj->isa('Bugzilla::Milestone') ||
        $obj->isa('Bugzilla::Group'))
    {
        my $filename = cache_ts_file();
        my $fh;
        open($fh, ">$filename") and do {
            print $fh time;
            close $fh;
        } or warn "Failed to update $filename: $!";
    }
}

sub object_end_of_create {
    my ($self, $args) = @_;
    _validate_fielddefs_cache($args->{object});
}

sub object_end_of_update {
    my ($self, $args) = @_;
    _validate_fielddefs_cache($args->{object});
}

sub page_before_template {
    my ($self, $args) = @_;
    if ($args->{page_id} eq 'bayotbase/fielddefs.js'){
        print Bugzilla->cgi->header(
                -expires=>'+1d',
                -Content_Type=>'text/javascript'
        );
        $args->{vars}->{fielddefs_json} = get_field_defs(as_json => 1);
    }
}

sub template_before_process {
    my ($self, $args) = @_;

    my $vars = $args->{vars};
    my $file = $args->{file};
    if ($file eq 'global/common-links.html.tmpl') {
        _build_common_links($args, $vars, $file);
    } elsif ($file eq 'global/header.html.tmpl') {
        $vars->{bb_field_cache_ts} = cache_timestamp();
        _make_bb_config($args, $vars, $file);
    } elsif ($file eq 'admin/table.html.tmpl' &&
        $vars->{template}->name eq 'admin/groups/list.html.tmpl')
    {
        _group_identifiers($vars);
    }
}

sub template_before_create {
    my ($self, $params) = @_;
    # TODO: document remove_query_param template filter
    $params->{config}->{FILTERS}->{remove_query_param} = [
        sub {
            my ($context, @args) = @_;
            return sub {
                my $query = shift;
                my ($param) = @args;
                my @parts = grep($_ !~ /^$param=/, split('&', $query));
                return join('&', @parts);
            }
        }, 1
    ];
}

sub config_add_panels {
    my ($self, $args) = @_;
    my $modules = $args->{panel_modules};
    $modules->{BayotBase} = "Bugzilla::Extension::BayotBase::Config";
}

__PACKAGE__->NAME;
