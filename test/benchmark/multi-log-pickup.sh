
tag=`git describe --tags`

log=../../logs/maya.log
num=8


if [ $tag == "v1.0.2" ]; then

    for i in `seq $num`; do
        > ${log}.p$i
    done

    sleep 100

    for i in `seq $num`; do
        plog=${log}.p$i
        cp $plog maya-log/$i-`date +%F-%H:%M:%S`
    done

elif [ $tag == "v1.1.10" ]; then

    for i in `seq $num`; do
        > ${log}.p$i
    done

    sleep 100

    for i in `seq $num`; do
        plog=${log}.p$i
        cp $plog maya-log/$i-`date +%F-%H:%M:%S`
    done

elif [ $tag == "v0.3.10" ]; then
    > $log 
    sleep 800
    cp $log maya-log/`date +%F-%H:%M:%S`
fi
