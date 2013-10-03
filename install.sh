#!/bin/bash

install_dir="/usr/local/sina_maya"
init_dir="/etc/init.d/"

mkdir -p $install_dir/conf

for json in `ls conf`; do
    if [ ! -f $install_dir/conf/"$json" ]; then
        cp -r conf/"$json" $install_dir/conf
    fi
done

cp -fr bin/ src/ node_modules/ $install_dir && \
install $install_dir/bin/maya $init_dir/sina_maya

if [ $? -eq 0 ]; then
    echo "install success"
else
    echo "install failed"
fi
