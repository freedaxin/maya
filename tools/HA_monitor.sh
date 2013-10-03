#!/bin/sh
#
# Copyright (c) 2010 SINA Inc. All rights reserved.
# Version: 1.2
# Additioner : huixiang@staff.sina.com.cn <Platfor Dept.>
# Additioner : tanhu@staff.sina.com.cn <Platfor Dept.>
# Date: 2012-03-21


LOCAL_IP=`/sbin/ifconfig eth1 |grep "addr:10" | awk '{print $2}' | awk -F: '{print $2}' |tail -n 1`


mailalert(){
    check_item=$1
    object=$2
    subject=$3
    content=$4
    group="DB"
    service="HAproxy"
    /usr/bin/curl -d "group_name=$group&service_name=$service" -d object="$object" -d subject="$subject" -d content="$content" -d "grade=-1&gmail_to=$service&gmsg_to=$service" http://imonitor.sina.com.cn/cgi-bin/alertmail.cgi\?
}

check(){
    check_item=$1
    if [ -z "`/bin/ps -ef | grep -i $check_item | grep -v grep`" ];then
        /etc/init.d/$check_item stop
        /etc/init.d/$check_item start
        local object="$check_item Error"
        local subject="$check_item $LOCAL_IP process down (from $LOCAL_IP)."
        local content="Critical. $check_item IP:${LOCAL_IP} process down at `date +'%Y%m%d %H:%M:%S'` (from $LOCAL_IP)."
        echo "$content"
        echo "$content" >>/var/log/${check_item}.log
        mailalert "$check_item" "$object" "$subject" "$content" 
    else
        echo "DateTime:`date '+%Y-%m-%d %H:%M:%S'` $check_item process is normal."
    fi
}

check_haproxy_status(){
    check_item='maya'
    server_list=`cat /etc/haproxy/haproxy.cfg  |grep -v  '#' |grep server |awk '{print $3}'| awk -F':' '{print $1 ,$2}'`
    echo "$server_list" | while read host port
    do
        alive_info=`nc -w 1 $host $port </dev/null `
        if [ -z "$alive_info" ]; then
            local object="$check_item Error"
            local subject="$check_item $host :$port conn failed (from $LOCAL_IP)."
            local content="Critical. $check_item IP:$host $port conn failed at `date +'%Y%m%d %H:%M:%S'` (from $LOCAL_IP)."
            echo "$content"
            echo "$content" >>/var/log/${check_item}.log
            mailalert "$check_item" "$object" "$subject" "$content" 
        else
            echo "DateTime:`date '+%Y-%m-%d %H:%M:%S'` $check_item  ${host}:${port} is normal."
        fi
    done
}
####
check haproxy
check keepalived
check_haproxy_status

