#!/usr/local/bin/python
# encoding: utf-8
# need python26 or python27
"""
load_alert_sms.py
Created by huixiang on 2012-02-29
Last modified on 2012-03-05
Description: support multi-type in one table
             add exclude ip dict
Version:1.0
"""

import MySQLdb
import datetime
import sys,os,re,string
import optparse
import traceback
import urllib
import urllib2
import commands
import string
import json
import types

sys.path.append('/home/sndba/scripts/lib/')
import mydevtool as dev_t

#maya_list=['port:port_management:user:password']
maya_list=['19601:29601:mayauser:mayapass','13307:23307:mysqlha:Jxh2MnxeHw']
#maya_list=['13347:23347:maya_car:f3u4w8n7b3h','13305:23305:mysqlha:Jxh2MnxeHw']
db=['10.55.22.101:3388:dbmon']

user="mysqlha"
passwd="Jxh2MnxeHw"
cursor=dev_t.get_cursors(user,passwd,db)[0]
cursor.execute("set autocommit=1")
cursor.execute("set interactive_timeout=900")
cursor.execute("set wait_timeout=900")

###global values###
GROUP_NAME='DB'
SERVICE_NAME='taotest'
TYPE='DB-Maya'
DB_HOST_UNCHECK_LIST=['10.55.28.58']


def get_maya_info_list(maya_list):
    try:	
        maya_info_list=[]
        for maya_str in maya_list:
            port=int(maya_str.split(':')[0])
            port_management=int(maya_str.split(':')[1])
            maya_user=maya_str.split(':')[2]
            maya_passwd=maya_str.split(':')[3]
            cmd='''/home/sndba/scripts/bin/dbdig  %s |grep "address" | awk '{print $4}' ''' %(port)
            result=os.popen(cmd).read()
            if result == None or len(result)==0 :
                print "Warning . maya :port=%s not in dns."
                continue
            host_list=result.strip().split('\n')
            for host in host_list:
                maya_info=(host,port,port_management,maya_user,maya_passwd)
                maya_info_list.append(maya_info)
        return maya_info_list
    except Exception,ex:
        print ex
        traceback.print_exc()	

def check_maya_alive(host,port,user,passwd):
    try:	
        status = 0
      	conn = dev_t.get_conn(host,user,passwd,'test',port)
        if conn == None : 
            return status
        cursor = conn.cursor()
        cursor.execute("select 1")
        row = cursor.fetchone()
        if row !=None and row[0] == 1:
            status = 1
        return status
    except Exception,ex:
        print ex
        traceback.print_exc()	

def check_maya_alive_alert(host,port,user,passwd,alert_group):
    try:	
        is_alive = 0
        alter_value = 0
        check_time = datetime.datetime.now()
        check_time = check_time.strftime("%y-%m-%d %H:%M:%S")
        is_alive = check_maya_alive(host,port,user,passwd)
        if is_alive == 0:
            info = "DB:check_maya(%s:%s) : Critical, conn %s:%s failed.check_time:%s" %(host,port,host,port,check_time)
            object = ":" #%(host,port)
            subject = info
            content = subject
            grade = '-1'

            alter_value = send_alert(GROUP_NAME,alert_group,object,subject,content,grade)
            print "%s ,alter_value:%s" %(info,alter_value)
        else:
            print "DB:check_maya(%s,%s) :  conn %s:%s ok. check_time:%s" %(host,port,host,port,check_time)
        return is_alive
    except Exception,ex:
        print ex
        traceback.print_exc()	


def check_db_status(host,port,port_m,alert_group):
    try:	
        check_time = datetime.datetime.now()
        check_time = check_time.strftime("%y-%m-%d %H:%M:%S")
        manage_port_alive = 0
        cmd = "curl http://%s:%s" %(host,port_m)
        print cmd
        maya_db_status = {}
        result=os.popen(cmd).read()
#        print "=== %s ===\n " %(result)
        if result != None and result.find("couldn't connect to host") != -1 :
            info = "DB:check_maya(%s:%s) : Critical, conn %s:%s managment failed. check_time:%s" %(host,port,host,port,check_time)
            object = ""
            subject = info
            content = subject
            grade = '-1'
            alter_value = send_alert(GROUP_NAME,alert_group,object,subject,content,grade)
            return manage_port_alive
### management_port is alive
        manage_port_alive = 1
        db_alert_list = []
        maya_db_status = json.loads(result)
        groups_len = len(maya_db_status)
        if groups_len == 0:
            print "Warning! get %s:%s db status failed." %( host,port_m)
        for i in range(groups_len):
            group_name = maya_db_status[i]['name']
            dbs = maya_db_status[i]['dbs']
            for db in dbs:
                is_master = db['is_master']
                db_host = db['host']
                db_port = db['port']
                working_status = db['working_status']
                error_code = working_status['error_code']
                error_desc = working_status['error_desc']
                db_status = db['db_status']
####     host in DB_HOST_UNCHECK_LIST don't need checked 
                if db_host in DB_HOST_UNCHECK_LIST :
                    continue  
                if error_code != 0 :
#                    db_alert=(host,port,db_host,db_port,is_master,error_desc)
#                    db_alert_list.append(db_alert)
                    master = ""
                    if is_master == 1 :
                        master = "Master"                        
                    info = "DB:check_maya_db(%s:%s) : %s Critical,  mysql %s:%s is %s. check_time:%s" %(host,port,master,db_host,db_port,error_desc,check_time)
#                    print info
#                    object = "check_maya_db(%s:%s)" %(host,port) 
                    object = ":" 
                    subject = info
                    content = "%s \n == status ==\n status:%s \n == db_status ==\n db_status:%s " %(info,working_status,db_status)
                    grade = '-1'
                    try:
                        alter_value=send_alert(GROUP_NAME,alert_group,object,subject,content,grade)
                        print "%s alter_value=%s" %(info,alter_value)
                    except Exception,e:
                        traceback.print_exc()
                else :
                    info = "DB:check_maya_db(%s:%s) : status ok ,  mysql %s:%s is %s. check_time:%s" %(host,port,db_host,db_port,error_desc,check_time)
                    print info
        return db_alert_list
    except Exception,ex:
        print ex
        traceback.print_exc()	


def check_maya_main(maya_list,alert_group):
#    global GROUP_NAME,SERVICE_NAME
    try:	
        maya_info_list = get_maya_info_list(maya_list)
        print maya_info_list
        for maya_info in maya_info_list:
            (host,port,port_m,maya_user,maya_passwd) = maya_info
            is_alive = check_maya_alive_alert(host,port,maya_user,maya_passwd,alert_group)
            if is_alive == 1:
                check_db_status(host,port,port_m,alert_group)
        return maya_info_list
    except Exception,ex:
        print ex
        traceback.print_exc()	


def send_alert(group_name,service_name,object,subject,content,grade):
    try:	
        print group_name,service_name,object,subject,content,grade
        #urlstr = "http://10.55.21.44/cgi-bin/alertmail.cgi"
        urlstr = "http://imonitor.sina.com.cn/cgi-bin/alertmail.cgi"
        values0={'group_name':group_name.decode("utf8").encode("gbk"),
            'service_name':service_name.decode("utf8").encode("gbk"),
            'object':object.decode("utf8").encode("gbk"),
            'subject':subject.decode("utf8").encode("gbk"),
            'content':content.decode("utf8").encode("gbk"),
            'gmail_to':service_name,
            'gmsg_to':service_name,
            'grade':grade
            }
        paramstr = urllib.urlencode(values0)
        con = urllib2.urlopen(urlstr, paramstr,timeout=10)
        result = con.read()
        return result
    except Exception,ex:
        print ex
        traceback.print_exc()	

if __name__=="__main__":
    group1='weibo1'               ###'DBA_WEIBO'
    group2='weibo2'               ###'DBA_OPENAPI'
    group3='weibo3'               ###'DBA_OTHERS'
    group4='sinadb1'              ###'DBA_SSO_PAY'
    group5='sinadb2'              ###'DBA_BLOG_ETC'
    group6='sinadb3'              ###'DBA_OLD'
    group7='nosql'                ###'DBA_NOSQL'
#    group8='dba1'                ###'DBA_Maya'
    group8='taotest'                ###'DBA_Maya'
    check_maya_main(maya_list,group8)
#    check_db_status('10.69.6.38',13307,23307,group8)

  
