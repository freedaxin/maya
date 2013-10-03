#!/bin/sh

while true 
do
  echo "##################################"
  date
  
  echo "lsof -c node"
  lsof -c node|grep -v mem|wc -l
  
  echo "sar -n DEV 1 1"
  sar -n DEV 1 1 
  echo "mpstat -P ALL 1 1"
  mpstat -P ALL 1 1
  #echo "iostat -xm"
  #iostat -xm
  echo "vmstat"
  vmstat
  echo "free"
  free
  echo "ps aux|grep node"
  ps aux|grep node
  
  sleep 10
done
