#!/bin/bash

#log='/usr/local/sina_maya/logs/maya.log'
log='/data1/sina_maya/logs/maya.log'
#log='/usr/home/daxin1/maya.0.3/maya/logs/maya.log'

pid=1

#sleep 20
sudo sh -c "> $log"
for i in `seq 10`; do
	sleep 10
	sudo tail -$pid $log
	sudo tail -$pid $log | awk 'BEGIN{s = 0}{s+= $13}END{print s}'
done
sudo cp $log log
n=`cat log | awk 'BEGIN{s = 0}{s+= $13}END{print s}'`
echo $[$n/100]
