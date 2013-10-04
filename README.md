# maya

## 安装node.js
依赖node v0.8最新版，暂不支持更高的node版本，此处以0.8.7版本为例。

下载：http://nodejs.org/

root安装（官方要求python2.5.2以上）
```
tar -zxf node-v0.8.7.tar.gz 
cd node-v0.8.7
./configure --prefix=/usr/local/sinasrv2/
make
make install
```
在root环境变量中增加如下两项：
```
echo 'export NODE_PATH=/usr/local/sinasrv2:/usr/local/sinasrv2/lib/node_modules' >> ~/.bash_profile && echo 'export PATH=$PATH:/usr/local/sinasrv2/bin' >> ~/.bash_profile && source ~/.bash_profile
```
## 安装maya
root安装，进入maya主目录执行：
```
sh install.sh
```
程序安装在“/usr/local/sina_maya”并在“/etc/init.d/”下增加“/usr/local/sina_maya/bin/sina_maya“的软链用于启动服务
## 参数配置示例与说明
全局配置（global_conf.json）:
```
{
    #客户端连接端口
    "client_port" : 15050,
    #管理端口，对外输出服务状态
    "management_port": 15051,
    #客户端连接最大空闲时间，秒
    "max_idle_time" : 800,
    #允许连接的ip段，以%作为通配符，空表示不限制
    "allowed_ip": [],
    #拒绝的ip，优先级高于allowed_ip，配置规则与allowed_ip相同
    "denied_ip": [],
    #多进程配置
    "cluster" : {
        "workers" : 8
    }
}
```
数据库集群配置（db_cluster.json）
```
{
    #用于客户端与maya之间鉴权的用户名和密码
    "maya_user": "mayauser",
    "maya_pass": "mayapass",
    #数据库用户名、密码、db
    "mysql_user": "testuser",
    "mysql_passwd": "testpass",
    "mysql_db_name": "test",
    #最大可禁用slave比例，与从库数量相乘取整，默认0，即不禁用
    "max_disabled_slaves_percent": "50%",
    #服务端连接空闲超时，应与mysql服务端设置相同，默认5秒
    "server_conn_wait_timeout": 30,
    #服务端连接池最大连接数，默认2048
    "server_conn_pool_size": 2048,
    #单个客户端ip最大允许连接数，默认不限制
    "client_max_conn_num": 400,
    #数据库连接初始化命令，多个用半角”, ”分隔
    "server_init_commands": [
        "SET NAMES UTF8"
    ],
    #数据库监控参数
    "monitor": {
        // 检测间隔，单位：秒
        "detect_interval_seconds": 5,
        // 异常最大持续时间，单位：秒，超过则确认异常，执行禁用等处理
        "conn_fail_max_seconds": 9,
        // 从库最大延迟时间，单位：秒
        "slave_max_delay_seconds": 400,
        // 数据库最大连接数
        "server_max_connections": 1000
    },
    # db group数组
    "db_groups": [
        {
            #db group名称，唯一，不唯一时报错
            "name": "group_0",
            #数据库db name，优先级高于全局配置，未配置时默认使用全局
            "mysql_db_name ": "test0",
            "dbs": [
                {
                    "host": "127.0.0.1",
                    "port": 3306,
                    #主从标记，1表示主库，0表示从库，默认为0
                    "is_master": 1
                },
                {
                    "host": "127.0.0.2",
                    "port": 3306,
                    #从库权重，默认为1
                    "weight": 1,
                    #数据库db name，优先级高于全局配置
                    "mysql_db_name ": “db0”,
                    #监控禁用开关，0表示可禁用，1表示不禁用，默认为0
                    “disable_monitor”: 0
                },
                {
                    "host": "127.0.0.3",
                    "port": 3306,
                    "weight": 1
                }
            ]
        },
        {
            "name": "group_1",
            "dbs": [
                {
                    "host": "127.0.0.5",
                    "port": 3306,
                    "is_master": 1
                },
                {
                    "host": "127.0.0.6",
                    "port": 3306,
                    "weight": 1
                }
            ]
        }
    ],
    #虚拟表
    "virtual_table": {
        //用户访问的虚拟表名
        "virtual_table_name": "my_table",
        //虚拟表rowkey
        "rowkey": "id",
        //按db分区个数，1表示不按db分区，默认为1
        "db_partition_num": 8,
        //按table分区个数，1表示不按table分区，默认为1
        "table_partition_num": 64,
        //分片表分配到数据库实例的依据，”table”或”db”
        "assign_db_instance_by": "table",
        //分区表名称，%部分分别用db_partition_num、table_partition_num
        //按指定格式填充，支持c语言格式化控制
        //db或table分区数为1时不填充
        "partition_table_name_pattern": "db_%.02d.my_table_%.03x",
        "partitions": [
            {
                //分区所属db group
                "db_group": "group_0",
                //本db group包含的db分区范围，
                //不按db分区时可省略
                //中括号表示闭区间
                "db_range": "[0..3]",
                //本db group包含的table分区范围
                //不按table分区时可省略
                "table_range": "[0..31]"
            },
            {
                "db_group": "group_1",
                "db_range": "[4..7]",
                "table_range": "[32..63]"
            }
        ]
    }
}
```
## 运行方法
启动：
```
/usr/local/sina_maya/bin/sina_maya start
```
停止：
```
/usr/local/sina_maya/bin/sina_maya stop
```
状态查看：
```
/usr/local/sina_maya/bin/sina_maya status
```
重载配置：
```
/usr/local/sina_maya/bin/sina_maya reload
```
重启：
```
/usr/local/sina_maya/bin/sina_maya restart
```
检查配置文件
```
/usr/local/sina_maya/bin/sina_maya check_conf
```
## 注意事项：
* 要求修改系统默认文件句柄数限制（ulimit -n），不小于20万

## LICENSE

MIT  LICENSE

## ORIGINAL AUTHOR

Wang Daxin (freedaxin@github)

with awesome contributions from:

- Han Fang
- Cui Guilin
