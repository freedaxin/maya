#!/bin/sh

# parser.
cd maya-log/
for log in `ls`; do
    echo $log|awk -F'-' '{print $1}'
    count=`cat $log|grep seconds|head -50|tail -40|awk -F'[' '{print $5}'|awk -F']' 'BEGIN{s = 0}{s+= $1}END{print s}'`
    #cat $log|grep seconds|head -50|tail -40|awk -F'[' '{print $5}'|awk -F']' '{print $1}'
    echo $[$count/400]
done
