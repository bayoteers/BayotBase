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
# The Original Code is the BayotBase Bugzilla Extension.
#
# The Initial Developer of the Original Code is Nokia. Portions created by the
# Initial Developer are Copyright (C) 2012 Nokia. All Rights Reserved.
#
# Contributor(s):
#   David Wilson <ext-david.3.wilson@nokia.com>

package Bugzilla::Extension::BayotBase;
use strict;
use base qw(Bugzilla::Extension);

our $VERSION = '0.01';


# Invoke the bb_common_links hook, aggregating returned menu items into a
# bb_common_links variable, for hook/global/common-links-link-row.html.tmpl
sub build_common_links {
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

    $vars->{bb_common_links} = \@items;
}


sub template_before_process {
    my ($self, $args) = @_;

    my $vars = $args->{vars};
    my $file = $args->{file};

    build_common_links($args, $vars, $file);
}


sub config_add_panels {
    my ($self, $args) = @_;
    my $modules = $args->{panel_modules};
    $modules->{BayotBase} = "Bugzilla::Extension::BayotBase::Config";
}


__PACKAGE__->NAME;
