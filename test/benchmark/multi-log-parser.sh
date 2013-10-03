#!/bin/sh

# parser.
tag=`git describe --tags`
if [ $1 == "v1.0.2" ]; then
    count=`cat $1/maya-log/*|grep seconds|awk 'BEGIN{s = 0}{s+= $13}END{print s}'`
    #cat $log|grep seconds|head -50|tail -40|awk -F'[' '{print $5}'|awk -F']' '{print $1}'
    line=`cat $1/maya-log/*|grep seconds|wc -l`
    echo $[$[$count/$line/10] * 8]
elif [ $1 == "v1.1.10" ]; then
    count=`cat $1/maya-log/*|grep seconds|awk 'BEGIN{s = 0}{s+= $13}END{print s}'`
    #cat $log|grep seconds|head -50|tail -40|awk -F'[' '{print $5}'|awk -F']' '{print $1}'
    line=`cat $1/maya-log/*|grep seconds|wc -l`
    echo $[$[$count/$line/10] * 8]
elif [ $1 == "v1.1.14" ]; then
    count=`cat $1/maya-log/*|grep seconds|awk -F'[' '{print $5}'|awk -F']' 'BEGIN{s = 0}{s+= $1}END{print s}'`
    #cat $log|grep seconds|head -50|tail -40|awk -F'[' '{print $5}'|awk -F']' '{print $1}'
    line=`cat $1/maya-log/*|grep seconds|wc -l`
    echo $[$[$count/$line/10] * 8]
elif [ $1 == "v0.3.10" ]; then
    count=`cat $1/maya-log/*|grep seconds|awk 'BEGIN{s = 0}{s+= $13}END{print s}'`
    #cat $log|grep seconds|head -50|tail -40|awk -F'[' '{print $5}'|awk -F']' '{print $1}'
    line=`cat $1/maya-log/*|grep seconds|wc -l`
    echo $[$[$count/$line/10] * 8]
fi
