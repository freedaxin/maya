/**
 * @fileoverview mysql constants, copy from other mysql libs
 * @author wangdaxin daxin1@staff.sina.com.cn
 * @date 2011.12.29
 */

"use strict";

var flags = exports.flags = {
    CLIENT_LONG_PASSWORD : 1,/* new more secure passwords */
    CLIENT_FOUND_ROWS : 2,/* Found instead of affected rows */
    CLIENT_LONG_FLAG : 4,/* Get all column flags */
    CLIENT_CONNECT_WITH_DB : 8,/* One can specify db on connect */
    CLIENT_NO_SCHEMA : 16,/* Don't allow database.table.column */
    CLIENT_COMPRESS : 32,/* Can use compression protocol */
    CLIENT_ODBC : 64,/* Odbc client */
    CLIENT_LOCAL_FILES : 128,/* Can use LOAD DATA LOCAL */
    CLIENT_IGNORE_SPACE : 256,/* Ignore spaces before '(' */
    CLIENT_PROTOCOL_41 : 512,/* New 4.1 protocol */
    CLIENT_INTERACTIVE : 1024,/* This is an interactive client */
    CLIENT_SSL : 2048,/* Switch to SSL after handshake */
    CLIENT_IGNORE_SIGPIPE : 4096,/* IGNORE sigpipes */
    CLIENT_TRANSACTIONS : 8192,/* Client knows about transactions */
    CLIENT_RESERVED : 16384,/* Old flag for 4.1 protocol  */
    CLIENT_SECURE_CONNECTION : 32768,/* New 4.1 authentication */
    CLIENT_MULTI_STATEMENTS : 65536,/* Enable/disable multi-stmt support */
    CLIENT_MULTI_RESULTS : 131072
/* Enable/disable multi-results */
}

exports.field_flags = {
    NOT_NULL : 1, /* Field can't be NULL */
    PRI_KEY : 2, /* Field is part of a primary key */
    UNIQUE_KEY : 4, /* Field is part of a unique key */
    MULTIPLE_KEY : 8, /* Field is part of a key */
    BLOB : 16, /* Field is a blob */
    UNSIGNED : 32, /* Field is unsigned */
    ZEROFILL : 64, /* Field is zerofill */
    BINARY : 128,
}

exports.flags.CLIENT_BASIC_FLAGS = flags.CLIENT_LONG_PASSWORD
        | flags.CLIENT_FOUND_ROWS | flags.CLIENT_LONG_FLAG
        | flags.CLIENT_CONNECT_WITH_DB | flags.CLIENT_ODBC
        | flags.CLIENT_LOCAL_FILES | flags.CLIENT_IGNORE_SPACE
        | flags.CLIENT_PROTOCOL_41 | flags.CLIENT_INTERACTIVE
        | flags.CLIENT_IGNORE_SIGPIPE | flags.CLIENT_TRANSACTIONS
        | flags.CLIENT_RESERVED | flags.CLIENT_SECURE_CONNECTION
        | flags.CLIENT_MULTI_STATEMENTS | flags.CLIENT_MULTI_RESULTS;

exports.types = {
    MYSQL_TYPE_DECIMAL : 0,
    MYSQL_TYPE_TINY : 1,
    MYSQL_TYPE_SHORT : 2,
    MYSQL_TYPE_LONG : 3,
    MYSQL_TYPE_FLOAT : 4,
    MYSQL_TYPE_DOUBLE : 5,
    MYSQL_TYPE_NULL : 6,
    MYSQL_TYPE_TIMESTAMP : 7,
    MYSQL_TYPE_LONGLONG : 8,
    MYSQL_TYPE_INT24 : 9,
    MYSQL_TYPE_DATE : 10,
    MYSQL_TYPE_TIME : 11,
    MYSQL_TYPE_DATETIME : 12,
    MYSQL_TYPE_YEAR : 13,
    MYSQL_TYPE_NEWDATE : 14,
    MYSQL_TYPE_VARCHAR : 15,
    MYSQL_TYPE_BIT : 16,
    MYSQL_TYPE_NEWDECIMAL : 246,
    MYSQL_TYPE_ENUM : 247,
    MYSQL_TYPE_SET : 248,
    MYSQL_TYPE_TINY_BLOB : 249,
    MYSQL_TYPE_MEDIUM_BLOB : 250,
    MYSQL_TYPE_LONG_BLOB : 251,
    MYSQL_TYPE_BLOB : 252,
    MYSQL_TYPE_VAR_STRING : 253,
    MYSQL_TYPE_STRING : 254,
    MYSQL_TYPE_GEOMETR : 255
};

exports.type_names = {};

for ( var tname in exports.types) {
    if (exports.types.hasOwnProperty(tname)) {
        var type = exports.types[tname];
        exports.type_names[type] = tname;
    }
}

exports.com_nums = {
    COM_SLEEP : 0x00,
    COM_QUIT : 0x01,
    COM_INIT_DB : 0x02,
    COM_QUERY : 0x03,
    COM_FIELD_LIST : 0x04,
    COM_CREATE_DB : 0x05,
    COM_DROP_DB : 0x06,
    COM_REFRESH : 0x07,
    COM_SHUTDOWN : 0x08,
    COM_STATISTICS : 0x09,
    COM_PROCESS_INFO : 0x0a,
    COM_CONNECT : 0x0b,
    COM_PROCESS_KILL : 0x0c,
    COM_DEBUG : 0x0d,
    COM_PING : 0x0e,
    COM_TIME : 0x0f,
    COM_DELAYED_INSERT : 0x10,
    COM_CHANGE_USER : 0x11,
    COM_BINLOG_DUMP : 0x12,
    COM_TABLE_DUMP : 0x13,
    COM_CONNECT_OUT : 0x14,
    COM_REGISTER_SLAVE : 0x15,
    COM_STMT_PREPARE : 0x16,
    COM_STMT_EXECUTE : 0x17,
    COM_STMT_SEND_LONG_DATA : 0x18,
    COM_STMT_CLOSE : 0x19,
    COM_STMT_RESET : 0x1a,
    COM_SET_OPTION : 0x1b,
    COM_STMT_FETCH : 0x1c,
}

exports.MAYA_ERROR = {
    IP_CONN_FULL : {
        err_no: 1040,
        sql_state: "08004",
        message: "Too many connections for user: ",
    },
    ACCESS_DENIED : {
        err_no: 1045,
        sql_state: "28000",
        message: "Access denied for user: ",
    },
    NOT_SUPPORTED_OPERATION : {
        err_no: 50002,
        sql_state: "50002",
        message: "Not supported operation",
    },
    PARTITION_TABLE_NOT_FOUND : {
        err_no: 50003,
        sql_state: "50003",
        message: "Partition table not found",
    },
    IP_DENIED : {
        err_no: 50004,
        sql_state: "50004",
        message: "Access denied from this ip",
    },
    MULTI_WRITE_DISABLED : {
        err_no: 50005,
        sql_state: "50005",
        message: "Multi slice write disabled",
    },
    SERVER_CONN_FAIL : {
        err_no: 50006,
        sql_state: "50006",
        message: "Server connection failed",
    },
    PARTIAL_SLICE_FAIL : {
        err_no: 50007,
        sql_state: "50007",
        message: "Partial slice failed",
    },
    NO_STMT_ID : {
        err_no: 50008,
        sql_state: "50008",
        message: "No such prepare stmt id",
    },
    INTERNAL_ERROR : {
        err_no: 60001,
        sql_state: "60001",
        message: "Maya internal error",
    }
}

var i=0;
exports.SQL_TOKENS = {
    TK_UNKNOWN : i++,

    TK_LE : i++,
    TK_GE : i++,
    TK_LT : i++,
    TK_GT : i++,
    TK_EQ : i++,
    TK_NE : i++,

    TK_STRING : i++,
    TK_COMMENT : i++,
    TK_LITERAL : i++,
    TK_FUNCTION : i++,

    TK_INTEGER : i++,
    TK_FLOAT : i++,
    TK_DOT : i++,
    TK_COMMA : i++,

    TK_ASSIGN : i++,
    TK_OBRACE : i++,
    TK_CBRACE : i++,
    TK_SEMICOLON : i++,

    TK_STAR : i++,
    TK_PLUS : i++,
    TK_MINUS : i++,
    TK_DIV : i++,

    TK_BITWISE_AND : i++,
    TK_BITWISE_OR : i++,
    TK_BITWISE_XOR : i++,

    TK_LOGICAL_AND : i++,
    TK_LOGICAL_OR : i++,

    /** a generated list of tokens */
    TK_SQL_ACCESSIBLE : i++,
    TK_SQL_ACTION : i++,
    TK_SQL_ADD : i++,
    TK_SQL_ALL : i++,
    TK_SQL_ALTER : i++,
    TK_SQL_ANALYZE : i++,
    TK_SQL_AND : i++,
    TK_SQL_AS : i++,
    TK_SQL_ASC : i++,
    TK_SQL_ASENSITIVE : i++,
    TK_SQL_BEFORE : i++,
    TK_SQL_BETWEEN : i++,
    TK_SQL_BIGINT : i++,
    TK_SQL_BINARY : i++,
    TK_SQL_BIT : i++,
    TK_SQL_BLOB : i++,
    TK_SQL_BOTH : i++,
    TK_SQL_BY : i++,
    TK_SQL_CALL : i++,
    TK_SQL_CASCADE : i++,
    TK_SQL_CASE : i++,
    TK_SQL_CHANGE : i++,
    TK_SQL_CHAR : i++,
    TK_SQL_CHARACTER : i++,
    TK_SQL_CHECK : i++,
    TK_SQL_COLLATE : i++,
    TK_SQL_COLUMN : i++,
    TK_SQL_CONDITION : i++,
    TK_SQL_CONSTRAINT : i++,
    TK_SQL_CONTINUE : i++,
    TK_SQL_CONVERT : i++,
    TK_SQL_CREATE : i++,
    TK_SQL_CROSS : i++,
    TK_SQL_CURRENT_DATE : i++,
    TK_SQL_CURRENT_TIME : i++,
    TK_SQL_CURRENT_TIMESTAMP : i++,
    TK_SQL_CURRENT_USER : i++,
    TK_SQL_CURSOR : i++,
    TK_SQL_DATABASE : i++,
    TK_SQL_DATABASES : i++,
    TK_SQL_DATE : i++,
    TK_SQL_DAY_HOUR : i++,
    TK_SQL_DAY_MICROSECOND : i++,
    TK_SQL_DAY_MINUTE : i++,
    TK_SQL_DAY_SECOND : i++,
    TK_SQL_DEC : i++,
    TK_SQL_DECIMAL : i++,
    TK_SQL_DECLARE : i++,
    TK_SQL_DEFAULT : i++,
    TK_SQL_DELAYED : i++,
    TK_SQL_DELETE : i++,
    TK_SQL_DESC : i++,
    TK_SQL_DESCRIBE : i++,
    TK_SQL_DETERMINISTIC : i++,
    TK_SQL_DISTINCT : i++,
    TK_SQL_DISTINCTROW : i++,
    TK_SQL_DIV : i++,
    TK_SQL_DOUBLE : i++,
    TK_SQL_DROP : i++,
    TK_SQL_DUAL : i++,
    TK_SQL_EACH : i++,
    TK_SQL_ELSE : i++,
    TK_SQL_ELSEIF : i++,
    TK_SQL_ENCLOSED : i++,
    TK_SQL_ENUM : i++,
    TK_SQL_ESCAPED : i++,
    TK_SQL_EXISTS : i++,
    TK_SQL_EXIT : i++,
    TK_SQL_EXPLAIN : i++,
    TK_SQL_FALSE : i++,
    TK_SQL_FETCH : i++,
    TK_SQL_FLOAT : i++,
    TK_SQL_FLOAT4 : i++,
    TK_SQL_FLOAT8 : i++,
    TK_SQL_FOR : i++,
    TK_SQL_FORCE : i++,
    TK_SQL_FOREIGN : i++,
    TK_SQL_FROM : i++,
    TK_SQL_FULLTEXT : i++,
    TK_SQL_GRANT : i++,
    TK_SQL_GROUP : i++,
    TK_SQL_HAVING : i++,
    TK_SQL_HIGH_PRIORITY : i++,
    TK_SQL_HOUR_MICROSECOND : i++,
    TK_SQL_HOUR_MINUTE : i++,
    TK_SQL_HOUR_SECOND : i++,
    TK_SQL_IF : i++,
    TK_SQL_IGNORE : i++,
    TK_SQL_IN : i++,
    TK_SQL_INDEX : i++,
    TK_SQL_INFILE : i++,
    TK_SQL_INNER : i++,
    TK_SQL_INOUT : i++,
    TK_SQL_INSENSITIVE : i++,
    TK_SQL_INSERT : i++,
    TK_SQL_INT : i++,
    TK_SQL_INT1 : i++,
    TK_SQL_INT2 : i++,
    TK_SQL_INT3 : i++,
    TK_SQL_INT4 : i++,
    TK_SQL_INT8 : i++,
    TK_SQL_INTEGER : i++,
    TK_SQL_INTERVAL : i++,
    TK_SQL_INTO : i++,
    TK_SQL_IS : i++,
    TK_SQL_ITERATE : i++,
    TK_SQL_JOIN : i++,
    TK_SQL_KEY : i++,
    TK_SQL_KEYS : i++,
    TK_SQL_KILL : i++,
    TK_SQL_LEADING : i++,
    TK_SQL_LEAVE : i++,
    TK_SQL_LEFT : i++,
    TK_SQL_LIKE : i++,
    TK_SQL_LIMIT : i++,
    TK_SQL_LINEAR : i++,
    TK_SQL_LINES : i++,
    TK_SQL_LOAD : i++,
    TK_SQL_LOCALTIME : i++,
    TK_SQL_LOCALTIMESTAMP : i++,
    TK_SQL_LOCK : i++,
    TK_SQL_LONG : i++,
    TK_SQL_LONGBLOB : i++,
    TK_SQL_LONGTEXT : i++,
    TK_SQL_LOOP : i++,
    TK_SQL_LOW_PRIORITY : i++,
    TK_SQL_MASTER_SSL_VERIFY_SERVER_CERT : i++,
    TK_SQL_MATCH : i++,
    TK_SQL_MEDIUMBLOB : i++,
    TK_SQL_MEDIUMINT : i++,
    TK_SQL_MEDIUMTEXT : i++,
    TK_SQL_MIDDLEINT : i++,
    TK_SQL_MINUTE_MICROSECOND : i++,
    TK_SQL_MINUTE_SECOND : i++,
    TK_SQL_MOD : i++,
    TK_SQL_MODIFIES : i++,
    TK_SQL_NATURAL : i++,
    TK_SQL_NO : i++,
    TK_SQL_NOT : i++,
    TK_SQL_NO_WRITE_TO_BINLOG : i++,
    TK_SQL_NULL : i++,
    TK_SQL_NUMERIC : i++,
    TK_SQL_ON : i++,
    TK_SQL_OPTIMIZE : i++,
    TK_SQL_OPTION : i++,
    TK_SQL_OPTIONALLY : i++,
    TK_SQL_OR : i++,
    TK_SQL_ORDER : i++,
    TK_SQL_OUT : i++,
    TK_SQL_OUTER : i++,
    TK_SQL_OUTFILE : i++,
    TK_SQL_PRECISION : i++,
    TK_SQL_PRIMARY : i++,
    TK_SQL_PROCEDURE : i++,
    TK_SQL_PURGE : i++,
    TK_SQL_RANGE : i++,
    TK_SQL_READ : i++,
    TK_SQL_READ_ONLY : i++,
    TK_SQL_READS : i++,
    TK_SQL_READ_WRITE : i++,
    TK_SQL_REAL : i++,
    TK_SQL_REFERENCES : i++,
    TK_SQL_REGEXP : i++,
    TK_SQL_RELEASE : i++,
    TK_SQL_RENAME : i++,
    TK_SQL_REPEAT : i++,
    TK_SQL_REPLACE : i++,
    TK_SQL_REQUIRE : i++,
    TK_SQL_RESTRICT : i++,
    TK_SQL_RETURN : i++,
    TK_SQL_REVOKE : i++,
    TK_SQL_RIGHT : i++,
    TK_SQL_RLIKE : i++,
    TK_SQL_SCHEMA : i++,
    TK_SQL_SCHEMAS : i++,
    TK_SQL_SECOND_MICROSECOND : i++,
    TK_SQL_SELECT : i++,
    TK_SQL_SENSITIVE : i++,
    TK_SQL_SEPARATOR : i++,
    TK_SQL_SET : i++,
    TK_SQL_SHOW : i++,
    TK_SQL_SMALLINT : i++,
    TK_SQL_SPATIAL : i++,
    TK_SQL_SPECIFIC : i++,
    TK_SQL_SQL : i++,
    TK_SQL_SQL_BIG_RESULT : i++,
    TK_SQL_SQL_CALC_FOUND_ROWS : i++,
    TK_SQL_SQLEXCEPTION : i++,
    TK_SQL_SQL_SMALL_RESULT : i++,
    TK_SQL_SQLSTATE : i++,
    TK_SQL_SQLWARNING : i++,
    TK_SQL_SSL : i++,
    TK_SQL_STARTING : i++,
    TK_SQL_STRAIGHT_JOIN : i++,
    TK_SQL_TABLE : i++,
    TK_SQL_TERMINATED : i++,
    TK_SQL_TEXT : i++,
    TK_SQL_THEN : i++,
    TK_SQL_TIME : i++,
    TK_SQL_TIMESTAMP : i++,
    TK_SQL_TINYBLOB : i++,
    TK_SQL_TINYINT : i++,
    TK_SQL_TINYTEXT : i++,
    TK_SQL_TO : i++,
    TK_SQL_TRAILING : i++,
    TK_SQL_TRIGGER : i++,
    TK_SQL_TRUE : i++,
    TK_SQL_UNDO : i++,
    TK_SQL_UNION : i++,
    TK_SQL_UNIQUE : i++,
    TK_SQL_UNLOCK : i++,
    TK_SQL_UNSIGNED : i++,
    TK_SQL_UPDATE : i++,
    TK_SQL_USAGE : i++,
    TK_SQL_USE : i++,
    TK_SQL_USING : i++,
    TK_SQL_UTC_DATE : i++,
    TK_SQL_UTC_TIME : i++,
    TK_SQL_UTC_TIMESTAMP : i++,
    TK_SQL_VALUE : i++,
    TK_SQL_VALUES : i++,
    TK_SQL_VARBINARY : i++,
    TK_SQL_VARCHAR : i++,
    TK_SQL_VARCHARACTER : i++,
    TK_SQL_VARYING : i++,
    TK_SQL_WHEN : i++,
    TK_SQL_WHERE : i++,
    TK_SQL_WHILE : i++,
    TK_SQL_WITH : i++,
    TK_SQL_WRITE : i++,
    TK_SQL_X509 : i++,
    TK_SQL_XOR : i++,
    TK_SQL_YEAR_MONTH : i++,
    TK_SQL_ZEROFILL : i++,

    TK_SQL_START : i++,
    TK_SQL_BEGIN : i++,
    TK_SQL_COMMIT : i++,
    TK_SQL_ROLLBACK : i++,
    TK_SQL_AUTOCOMMIT : i++,

    TK_SQL_DUPLICATE : i++,
    TK_SQL_OFFSET : i++,
    TK_COMMENT_MYSQL : i++,
    TK_LAST_TOKEN : i++,
}
