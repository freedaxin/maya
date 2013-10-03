#!/bin/sh

middle_host=10.210.214.125
config=~/benchmark-config
scp amoblin@$middle_host:~/benchmark-config $config

server=`cat $config| grep server | awk '{print $2}'`
C=`cat $config| grep count| awk '{print $2}'`
table_type=`cat $config| grep table_type| awk '{print $2}'`
connection_type=`cat $config| grep connection_type| awk '{print $2}'`
port=`cat $config| grep port | awk '{print $2}'`

echo $server $C $table_type $connection_type $port

if [ $table_type == 1 ]; then
    sql="SELECT uid, fid, ctime FROM \`file\` where uid='1'"
else
    sql="SELECT uid, fid, ctime FROM \`file_001\` where uid='1'"
fi

N=200000000

#mysqlslap=~/mysql-5.5.24/BUILD/client/mysqlslap
mysqlslap=~/mysql-5.5.24/client/mysqlslap
#mysqlslap=~/mysql-5.1.62/client/mysqlslap

database=vdisk_fs

$mysqlslap --delimiter=";" --query="$sql" \
--create-schema=$database \
--detach=$connection_type \
--concurrency=$C \
--number-of-queries=$N \
-h $server \
-i 1 \
-P$port -uvdisk -pmayapass
