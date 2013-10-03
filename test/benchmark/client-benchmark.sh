#!/bin/sh

middle_host=10.210.214.125

corrency=`ssh amoblin@$middle_host "tail -1 benchmark-config" | awk '{print $1}'`
count=`ssh amoblin@$middle_host "tail -1 benchmark-config" | awk '{print $2}'`
step=`ssh amoblin@$middle_host "tail -1 benchmark-config" | awk '{print $3}'`

ssh amoblin@$middle_host "echo 0 > flag"

for i in `seq $count`; do
    corrency=$[$corrency + $step]
    while true; do
        sleep 5
        flag=`ssh amoblin@$middle_host "cat flag"`
        if [ $flag -eq $corrency ]; then
            ssh amoblin@$middle_host "echo $[$corrency+1] > flag"
            echo "Now at $corrency"
            ./mysqlslap.sh $corrency >> result.txt
            ssh amoblin@$middle_host "echo $[$corrency+2] > flag"
            break
        fi
    done
done
