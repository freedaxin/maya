#!/usr/bin/env python2.6
# -*- coding:utf8 -*-

import MySQLdb as mysqldb
import time
from multiprocessing import Process
from optparse import OptionParser

def test_select(cursor, i):
    print "test select..."
    sql = "select uid,fid,ctime, name, folder_id, bytes, type, md5, sha1 from file where uid=%d" % i
    cursor.execute(sql)
    #print "select uid,fid,ctime from file where uid='%d'" % i
    result = cursor.fetchone()
    if result != (i, i, 0, '', 0, 0, '', '', ''):
        print sql
        print (i, i, 0, i, i, i, '', '', '')
        print result

def test_insert(cursor, i):
    print "test insert..."
    sql = "insert into file(uid,fid,ctime, name, folder_id, bytes, type, md5, sha1) values(%d, %d, %d, '', %d, %d, '', '', '') " % (i, i, 0, 0, 0)
    try:
        assert cursor.execute(sql) == 1
    except:
        print "insert error"

def test_update(cursor, i):
    print "test update..."
    sql = "update file set fid=fid+1 where uid = %d" % i
    assert cursor.execute(sql) == 1

def test_delete(cursor, i):
    print "test delete..."
    sql = "delete from file where uid = '%d' " % i
    cursor.execute(sql)

class ShortConnection(Process):
    def __init__(self, host, x, num):
        Process.__init__(self)
        self.host = host;
        self.num= num;
        self.x = x;

    def run(self):
        for i in range(1, self.num+1):
            i += self.x * self.num
            self.per_conn(i)

    def per_conn(self, i):
        conn = mysqldb.connect(
                host = self.host,
                user = "vdisk",
                passwd = "mayapass",
                port = 3307,
                #connect_timeout=30,
                #init_command="set autocommit=1",
                db = "vdisk_fs",
                )

        cursor = conn.cursor()

        cursor.execute("select uid,fid,ctime from file where uid='%d'" % i);
        #print "select uid,fid,ctime from file where uid='%d'" % i
        result = cursor.fetchone()
        #print result
        assert result == (i, i, 0)

        cursor.close()

class LongConnection(Process):
    def __init__(self, host, x, num):
        Process.__init__(self)
        self.host = host;
        self.num = num;
        self.x = x;

    def run(self):
        conn = mysqldb.connect(
                host = self.host,
                user = "vdisk",
                passwd = "mayapass",
                port = 3307,
                #connect_timeout=30,
                #init_command="set autocommit=1",
                db = "vdisk_fs",
                )
        cursor = conn.cursor()

        test_delete(cursor, 123456789)
        test_insert(cursor, 123456789)
        test_select(cursor, 123456789)
        test_update(cursor, 123456789)
        test_delete(cursor, 123456789)

        cursor.close()

def benchmark(host, conn_type, thread_num, repeat_num):
    threads = []
    for x in range(0, thread_num):
        if conn_type == 'short':
            threads.append( ShortConnection(host, x, repeat_num) )
        else:
            threads.append( LongConnection(host, x, repeat_num) )

    start = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    consume_time = time.time() - start
    print "response time: %s" % consume_time

if __name__ == "__main__":
    parser = OptionParser()
    parser.add_option("-c", dest="corrency", help="connection corrency number.", default="1", type="int")
    (opts, args) = parser.parse_args()

    thread_num = opts.corrency;
    repeat_num = 1;
    host = "10.75.15.236"
    benchmark(host, 'long', thread_num, repeat_num)
    #benchmark("10.75.15.236", 'short', thread_num, repeat_num)

