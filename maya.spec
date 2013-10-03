#
# Begin Our Macros Define.
#
%define _name_prefix           sinasrv2
%define _signature             gpg
%define _gpg_name              SinaSRV-2 Key <sinasrv-2key@sys.sina.com.cn>
%define _subgroup              server
%define _srcname	           %{_name}-%{version}.zip
%define _name		           maya
%define _version               1.4.0
%define debug_package          %{nil}

#
# Begin RPM Package Define.
#
Summary: maya-%{_version} (RHEL AS%{_osvernum} / CentOS%{_osvernum})
Name: %{_name_prefix}-%{_name}
Version: %{_version}
Release: 1
Vendor: Sina Beijing Network System Dept. 2009
License: GPL
Group: Applications/%{_name_prefix}-%{_subgroup}
URL: http://sys.sina.com.cn/download/
Source0: http://sys.sina.com.cn/download/%{_srcname}
BuildRoot: %{_tmppath}/%{name}-buildroot
Requires: rpm >= 4.2,sinasrv2-node >= 0.8

%description
Version %{version}, rpm prebuilded package release.
Maintainer : daxin@staff.sina.com.cn <Network System Dept.>
Copyright (c) 2012 SINA Inc. All rights reserved.

%prep
echo %{_exist}
%setup -q -n %{_name}-%{_version}
%{__cp} %{_specdir}/%{_name}.spec %{_builddir}/%{_name}-%{_version}

%build

%install
rm -rf $RPM_BUILD_ROOT
install_dir=$RPM_BUILD_ROOT/usr/local/sina_maya
init_dir=$RPM_BUILD_ROOT/etc/init.d
mkdir -p $install_dir && \
cp -fr bin/ src/ conf/ node_modules/ $install_dir && \
chmod 744 $install_dir/bin/maya && \
mkdir -p $init_dir && \
ln -sf /usr/local/sina_maya/bin/maya $init_dir/sina_maya
install -m 644 maya.spec $RPM_BUILD_ROOT/usr/local/sina_maya

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root,-)
%doc
/usr/local/sina_maya/*
/etc/init.d/*

%config(noreplace) /usr/local/sina_maya/conf/maya.json
%config(noreplace) /usr/local/sina_maya/conf/log4js.json

%changelog
