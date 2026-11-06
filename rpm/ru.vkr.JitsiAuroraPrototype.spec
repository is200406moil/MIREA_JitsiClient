Name:       ru.vkr.JitsiAuroraPrototype
Summary:    Клиент видеоконференций Jitsi Meet для Авроры
Version:    0.1
Release:    131
License:    BSD-3-Clause
URL:        https://auroraos.ru
Source0:    %{name}-%{version}.tar.bz2

# Bundled private libraries: the documented Aurora application packaging model.
%global __provides_exclude_from ^%{_datadir}/%{name}/lib/.*$
%global __requires_exclude ^(libgst.*|libyuv\\.so.*|liborc-0\\.4\\.so.*|libdrm\\.so.*|libjpeg\\.so.*)$


Requires:   sailfishsilica-qt5 >= 0.10.9
Requires:   qt5-qtmultimedia
Requires:   libkeepalive
Requires:   qt5-qtdeclarative-import-multimedia
Requires:   qt5-qtmultimedia-plugin-mediaservice-gstmediacapture
BuildRequires:  pkgconfig(auroraapp)
BuildRequires:  pkgconfig(aurorawebview)
BuildRequires:  pkgconfig(Qt5Core)
BuildRequires:  pkgconfig(Qt5Qml)
BuildRequires:  pkgconfig(Qt5Quick)
BuildRequires:  pkgconfig(Qt5Network)
BuildRequires:  pkgconfig(Qt5Sql)
BuildRequires:  pkgconfig(qca2-qt5)
BuildRequires:  pkgconfig(streamcamera)

%ifarch x86_64
BuildRequires:  pkgconfig(gstreamer-1.0)
BuildRequires:  streamcamera-gstreamer-camera-plugin
BuildRequires:  streamcamera-gstreamer-codec-plugin
%endif


%description
Приложение для видеовстреч Jitsi Meet с сохранением комнат на устройстве.


%prep
%autosetup

%build
%qmake5
%make_build

%install
%make_install

%ifarch x86_64
private_libs=%{buildroot}%{_datadir}/%{name}/lib
mkdir -p "$private_libs/streamcamera" "%{buildroot}%{_datadir}/%{name}/licenses"
for library in libgstreamer-1.0.so.0 libgstallocators-1.0.so.0 libgstvideo-1.0.so.0 libgstbase-1.0.so.0 libgstphotography-1.0.so.0 libgstapp-1.0.so.0 libgstpbutils-1.0.so.0 libgstaudio-1.0.so.0 libgsttag-1.0.so.0 libyuv.so.0 liborc-0.4.so.0 libdrm.so.2 libjpeg.so.62; do
    install -m 644 "%{_libdir}/$library" "$private_libs/$library"
done
install -m 644 %{_libdir}/streamcamera/plugins/libstreamcamera-gstreamer-camera.so "$private_libs/streamcamera/"
install -m 644 %{_libdir}/streamcamera/plugins/libstreamcamera-gstreamer-codec.so "$private_libs/streamcamera/"
for licensedir in %{_datadir}/licenses/gstreamer1.0-* %{_datadir}/licenses/streamcamera-gstreamer-* %{_datadir}/licenses/libyuv-* %{_datadir}/licenses/orc-* %{_datadir}/licenses/libdrm-* %{_datadir}/licenses/libjpeg-*; do
    if [ -d "$licensedir" ]; then cp -R "$licensedir" "%{buildroot}%{_datadir}/%{name}/licenses/"; fi
done
%endif

%files
%defattr(-,root,root,-)
%{_bindir}/%{name}
%defattr(644,root,root,-)
%{_datadir}/%{name}
%{_datadir}/applications/%{name}.desktop
%{_datadir}/icons/hicolor/*/apps/%{name}.png

%changelog
* Fri Nov 06 2026 Giyosidinov Ismoilkhodzha <is200406moil@gmail.com> 0.1-131
- Show the filmstrip of a one to one meeting like the mobile client and allow pinning yourself

* Fri Nov 06 2026 Giyosidinov Ismoilkhodzha <is200406moil@gmail.com> 0.1-130
- Show the reason when the server refuses recording

* Fri Nov 06 2026 Giyosidinov Ismoilkhodzha <is200406moil@gmail.com> 0.1-129
- Show audio level rings around the avatar of the speaker

* Fri Nov 06 2026 Giyosidinov Ismoilkhodzha <is200406moil@gmail.com> 0.1-128
- Add file recording and a subtitles tab in the chat screen

* Fri Nov 06 2026 Giyosidinov Ismoilkhodzha <is200406moil@gmail.com> 0.1-127
- Remove the Pictures, UserDirs and Audio permissions

* Fri Nov 06 2026 Giyosidinov Ismoilkhodzha <is200406moil@gmail.com> 0.1-126
- Confirm screen sharing in an application dialog
- Keep saved logins when the key store does not answer
- Keep stream keys in the secure store, per server
- Show the connection indicator on participant tiles
