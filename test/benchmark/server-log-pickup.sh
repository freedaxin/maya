#!/bin/sh

num=1
#log=/usr/local/sina_maya/logs/maya.log
log=../../logs/maya.log

middle_host=10.210.214.125

corrency=`ssh amoblin@$middle_host "tail -1 benchmark-config" | awk '{print \$1}'`
count=`ssh amoblin@$middle_host "tail -1 benchmark-config" | awk '{print \$2}'`
step=`ssh amoblin@$middle_host "tail -1 benchmark-config" | awk '{print \$3}'`

while true; do
    flag=`ssh amoblin@$middle_host "cat flag"`
    if [ $flag -eq 0 ]; then
        break
    fi
    sleep 5
done

for i in `seq $num`; do
    plog=${log}.p$i
    > $plog 
done

for i in `seq $count`; do
    corrency=$[$corrency + $step]
    echo "Now at $corrency"
    ps -ef|grep server-system-info.sh|grep bash|awk '{print $2}'|xargs kill -9 > /dev/null 2>&1
    ./server-system-info.sh > cpu-info/info-$corrency-`date +%F-%H:%M:%S`&
    ssh amoblin@$middle_host "echo $corrency > flag"
    while true; do
        sleep 5
        if [ $flag -eq $[$corrency+2] ]; then
            for i in `seq $num`; do
                plog=${log}.p$i
                cp $plog maya-log/$corrency-$i-`date +%F-%H:%M:%S`
            done
            > $plog
            break
        fi
        flag=`ssh amoblin@$middle_host "cat flag"`
    done
done

