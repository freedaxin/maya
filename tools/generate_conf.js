var cluster={};
cluster.user='maya';
cluster.passwd='maya123456';
cluster.db_groups=[];

var db_conn={
    host:"10.75.19.80",
    port:9601,
    db_name:"ice_user",
    user:"maya",
    passwd:"maya123456",     
    weight:1
};

cluster.db_groups[0]={};
cluster.db_groups[0].name="group_"+0;
cluster.db_groups[0].master=db_conn;
cluster.db_groups[0].slaves=[];
cluster.db_groups[0].slaves[0]=db_conn;
cluster.db_groups[0].slaves[1]=db_conn;

var conf=JSON.stringify(cluster,null,4);
console.log(conf);
