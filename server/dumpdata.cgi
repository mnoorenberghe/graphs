#!/usr/bin/env python

import cgitb; cgitb.enable()

import os
import sys
import cgi
import time
import re
import gzip
import minjson as json

import cStringIO

from graphsdb import db

#
# returns a plain text file containing the information for a given dataset in two csv tables
#   the first table containing the dataset info (branch, date, etc)
#   the second table containing the databaset values
#
# incoming query string:
#
# setid=number
#  Where number is a valid setid 
#
# starttime=tval
#  Start time to return results from, in seconds since GMT epoch
# endtime=tval
#  End time, in seconds since GMT epoch

def doError(errCode):
    errString = "unknown error"
    if errCode == -1:
        errString = "bad tinderbox"
    elif errCode == -2:
        errString = "bad test name"
    print "{ resultcode: " + str(errCode) + ", error: '" + errString + "' }"

def esc(val):
    delim = '"'
    val = delim + str(val).replace(delim, delim + delim) + delim
    return val

def dumpData(fo, setid, starttime, endtime):
    info_s1, info_s2, values_s1, values_s2 = "", "", "", ""
    if starttime:
        info_s1   = " AND date >= " + starttime
        values_s1 = " AND dataset_values.time >= " + starttime
    if endtime:
        info_s2   = " AND date <= " + endtime
        values_s2 = " AND dataset_values.time <= " + endtime

    cur = db.cursor()
    
    setid = ",".join(setid)
    fo.write("dataset,machine,branch,test,date\n")
    sql = """
        SELECT 
            B.id, B.machine, B.branch, B.test, B.date 
        FROM 
            dataset_info as B 
        WHERE 
            id IN (%s)
            %s %s
    """ % (setid, info_s1, info_s2)
    cur.execute(sql)
    for row in cur:
        fo.write ('%s,%s,%s,%s,%s\n' % (esc(row[0]), esc(row[1]), esc(row[2]), esc(row[3]), esc(row[4])))

    fo.write("dataset,time,value,buildid,data\n")
    cur.close()
    cur = db.cursor()
    sql = """
        SELECT 
            dataset_values.dataset_id, dataset_values.time, dataset_values.value, 
            dataset_branchinfo.branchid, dataset_extra_data.data 
        FROM dataset_values 
        LEFT JOIN 
            dataset_branchinfo ON 
                dataset_values.dataset_id = dataset_branchinfo.dataset_id AND 
                dataset_values.time = dataset_branchinfo.time 
        LEFT JOIN 
            dataset_extra_data ON 
                dataset_values.dataset_id = dataset_extra_data.dataset_id AND 
                dataset_values.time = dataset_extra_data.time 
        WHERE 
            dataset_values.dataset_id IN (%s) 
            %s %s 
        ORDER BY 
            dataset_values.dataset_id, dataset_values.time
    """ % (setid, values_s1, values_s2)
    cur.execute(sql)
    for row in cur:
        fo.write ('%s,%s,%s,%s,%s\n' % (esc(row[0]), esc(row[1]), esc(row[2]), esc(row[3]), esc(row[4])))
    cur.close()

#if var is a number returns a value other than None
def checkNumber(var):
    if var is None:
      return 1
    reNumber = re.compile('^[0-9.]*$')
    return reNumber.match(var)

#if var is a string returns a value other than None
def checkString(var):
    if var is None:
      return 1
    reString = re.compile('^[0-9A-Za-z._()\- ]*$')
    return reString.match(var)

doGzip = 0
try:
    if "gzip" in os.environ["HTTP_ACCEPT_ENCODING"]:
        doGzip = 1
except:
    pass

form = cgi.FieldStorage()

for numField in ["setid"]:
    val = form.getlist(numField)
    for v in val:
        if not checkNumber(v):
            print "Invalid string arg: ", numField, " '" + v + "'"
            sys.exit(500)
    globals()[numField] = val

for numField in ["starttime", "endtime"]:
    val = form.getfirst(numField)
    if not checkNumber(val):
        print "Invalid string arg: ", numField, " '" + val + "'"
        sys.exit(500)
    globals()[numField] = val

if form.has_key('sel'):
    val = form.getfirst('sel')
    if not ',' in val:
        print "Invalid ?sel parameter"
        sys.exit(500)
    vals = val.split(',')
    if not len( vals ) == 2:
        print "Invalid ?sel parameter"
        sys.exit(500)
    starttime, endtime = vals[0], vals[1]

if form.has_key('show'):
    setid = form.getfirst('show').split(',')
    for id in setid:
        if not checkNumber(id):
            print "Content-Type: text/plain\n"
            print "Invalid id in show parameter\n"
            sys.exit(500)

if not setid:
    print "Content-Type: text/plain\n"
    print "No data set selected\n"
    sys.exit(500)

zbuf = cStringIO.StringIO()
zfile = zbuf
if doGzip == 1:
    zfile = gzip.GzipFile(mode = 'wb', fileobj = zbuf, compresslevel = 9)

dumpData(zfile, setid, starttime, endtime)

sys.stdout.write("Content-Type: text/x-csv\n")
if doGzip == 1:
    zfile.close()
    sys.stdout.write("Content-Encoding: gzip\n")
sys.stdout.write("\n")

sys.stdout.write(zbuf.getvalue())



