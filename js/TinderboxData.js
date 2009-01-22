/* -*- Mode: javascript; c-basic-offset: 4; indent-tabs-mode: nil; tab-width: 20; -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is new-graph code.
 *
 * The Initial Developer of the Original Code is
 *    Mozilla Corporation
 * Portions created by the Initial Developer are Copyright (C) 2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Vladimir Vukicevic <vladimir@pobox.com> (Original Author)
 *   Alice Nodelman <anodelman@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var getdatacgi = "api";

function checkErrorReturn(obj) {
    if (!obj || obj.stat != 'ok') {
        alert ("Error: " + (obj ? (obj.message + "(" + obj.code + ")") : "(nil)"));
        return false;
    }
    return true;
}

var gTinderboxDataCount = 0;

function TinderboxData() {
    this.testList = null;
    this.testData = {};
    this._id = gTinderboxDataCount;
    gTinderboxDataCount++;
}

TinderboxData.prototype = {
    eventTarget: null,

    testList: null,
    testData: null,

    defaultLoadRange: null,
    raw: 1,

    init: function () {
        // create an element to use as the event target
        $("body").append("<div style='display:none' id='__TinderboxData" + this._id + "'></div>");
        this.eventTarget = $("#__TinderboxData" + this._id);

        var self = this;
        //netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect")

        $.getJSON(getdatacgi + "/test",
            function (obj) {
                if (!checkErrorReturn(obj)) return;
                self.testList = obj.tests;
                $(self.eventTarget).trigger("tinderboxTestListAvailable", [self.testList]);
                  });
    },

    requestTestList: function (callback) {
        var self = this;
        
        if (this.testList != null) {
            callback.call (window, this.testList);
        } else {
            var cb = 
            function (event, testList) {
                $(self.eventTarget).unbind("tinderboxTestListAvailable", cb);
                (event.data).call (window, testList);
            };
            
            $(self.eventTarget).bind("tinderboxTestListAvailable", callback, cb);
        }
    },

    // get a dataset for testId if it exists; otherwise,
    // return null, and let the callee use requestDataSetFor
    getDataSetFor: function (testId) {
        if (testId in this.testData)
            return this.testData[testId];
    },


    requestLatestDataSetFor: function (test, arg1, arg2, arg3) {

        var self = this;

        var startTime = arg1;
        var endTime = arg2;
        var callback = arg3;

        if (arg1 && arg2 == null && arg3 == null) {
            callback = arg1;
            if (this.defaultLoadRange) {
                startTime = this.defaultLoadRange[0];
                endTime = this.defaultLoadRange[1];
                //log ("load range using default", startTime, endTime);
            } else {
                startTime = null;
                endTime = null;
            }
        }
    
        var cb = function (event, test, aDS, aStartTime, aEndTime) {
            if (makeTestKey(test) != testKey ||
                aStartTime > startTime ||
                aEndTime < endTime)
            {
                // not useful for us; there's another
                // outstanding request for our time range, so wait for that
                return;
            }

            $(self.eventTarget).unbind("tinderboxDataSetAvailable", cb);
            (event.data).call (window, test, aDS);
        };

        $(self.eventTarget).bind("tinderboxDataSetAvailable", callback, cb);

        var reqstr = getdatacgi + "/test/runs/latest?id=" + test.id + "&branchid=" + test.branch_id + "&machineid=" + test.machine_id;
        
        if (startTime)
            reqstr += "&starttime=" + startTime;
        if (endTime)
            reqstr += "&endtime=" + endTime;
        //raw data is the extra_data column

        //log (reqstr);
        $.get(reqstr,
              function (resp) {
                var obj = (window.JSON) ? JSON.parse(resp) : eval('(' + resp + ')');
                
                if (!checkErrorReturn(obj)) return;
                
                var ds = gGraphType == GRAPH_TYPE_VALUE ? new TimeValueDataSet(obj.test_runs) : new TimeValueDataSet(obj.values);
                //this is the the case of a discrete graph - where the entire test run is always requested
                //so the start and end points are the first and last entries in the returned data set
                if  (!startTime && !endTime)  {
                    startTime = ds.data[0];
                    endTime = ds.data[ds.data.length -2];
                }
                ds.requestedFirstTime = startTime;
                ds.requestedLastTime = endTime;
                self.testData[testKey] = ds;
                if (obj.annotations)
                    ds.annotations = new TimeStringDataSet(obj.annotations);
                if (obj.baselines)
                    ds.baselines = obj.baselines;
                if (obj.rawdata)
                    ds.rawdata = obj.rawdata;
                if (obj.stats)
                    ds.stats = obj.stats;
              
                $(self.eventTarget).trigger("tinderboxDataSetAvailable", [test, ds, startTime, endTime]);

                  });
    },


    // arg1 = startTime, arg2 = endTime, arg3 = callback
    // arg1 = callback, arg2/arg3 == null
    requestDataSetFor: function (test, arg1, arg2, arg3) {
        var testKey = makeTestKey(test);
        var self = this;

        var startTime = arg1;
        var endTime = arg2;
        var callback = arg3;

        if (arg1 && arg2 == null && arg3 == null) {
            callback = arg1;
            if (this.defaultLoadRange) {
                startTime = this.defaultLoadRange[0];
                endTime = this.defaultLoadRange[1];
                //log ("load range using default", startTime, endTime);
            } else {
                startTime = null;
                endTime = null;
            }
        }

        if (testKey in this.testData) {
            var ds = this.testData[testKey];
            //log ("Can maybe use cached?");
            if ((ds.requestedFirstTime == null && ds.requestedLastTime == null) ||
                (ds.requestedFirstTime <= startTime &&
                 ds.requestedLastTime >= endTime))
            {
                //log ("Using cached ds");
                callback.call (window, testId, ds);
                return;
            }

            // this can be optimized, if we request just the bookend bits,
            // but that's overkill
            if (ds.firstTime < startTime)
                startTime = ds.firstTime;
            if (ds.lastTime > endTime)
                endTime = ds.lastTime;
        }

        var cb = function (event, test, aDS, aStartTime, aEndTime) {
            if (makeTestKey(test) != testKey ||
                aStartTime > startTime ||
                aEndTime < endTime)
            {
                // not useful for us; there's another
                // outstanding request for our time range, so wait for that
                return;
            }

            $(self.eventTarget).unbind("tinderboxDataSetAvailable", cb);
            (event.data).call (window, test, aDS);
        };

        $(self.eventTarget).bind("tinderboxDataSetAvailable", callback, cb);

        //netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect")
        if(gGraphType == GRAPH_TYPE_VALUE) {
            var reqstr = getdatacgi + "/test/runs?id=" + test.id + "&branchid="+test.branch_id+"&machineid="+test.machine_id;
        } else {
            var reqstr = getdatacgi + "/test/runs/values?id=" + test.testRunId;
        }
        
        if (startTime)
            reqstr += "&starttime=" + startTime;
        if (endTime)
            reqstr += "&endtime=" + endTime;
        //raw data is the extra_data column

        //log (reqstr);
        $.get(reqstr,
              function (resp) {
                var obj = (window.JSON) ? JSON.parse(resp) : eval('(' + resp + ')');
                
                if (!checkErrorReturn(obj)) return;
                
                var ds = gGraphType == GRAPH_TYPE_VALUE ? new TimeValueDataSet(obj.test_runs) : new TimeValueDataSet(obj.values);
                //this is the the case of a discrete graph - where the entire test run is always requested
                //so the start and end points are the first and last entries in the returned data set
                if  (!startTime && !endTime)  {
                    startTime = ds.data[0];
                    endTime = ds.data[ds.data.length -2];
                }
                ds.requestedFirstTime = startTime;
                ds.requestedLastTime = endTime;
                self.testData[testKey] = ds;
                if (obj.annotations)
                    ds.annotations = new TimeStringDataSet(obj.annotations);
                if (obj.baselines)
                    ds.baselines = obj.baselines;
                if (obj.rawdata)
                    ds.rawdata = obj.rawdata;
                if (obj.stats)
                    ds.stats = obj.stats;
              
                $(self.eventTarget).trigger("tinderboxDataSetAvailable", [test, ds, startTime, endTime]);

                  });

// function (obj) {alert ("Error talking to " + getdatacgi + " (" + obj + ")"); log (obj.stack); });
    },

    clearValueDataSets: function () {
        //log ("clearvalueDatasets");
        this.tinderboxTestData = {};
    },

};

function DiscreteTinderboxData() {
};

DiscreteTinderboxData.prototype = {
    __proto__: new TinderboxData(),
   
    init: function () {
    },
    
    requestTestList: function (limitDate, branch, machine, testname, getBuildID, callback) {
        var self = this;
        //netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect")
        var limiters = "";

        var tDate = 0;
        if (limitDate != null) {
          tDate = new Date().getTime();
          tDate -= limitDate * 86400 * 1000;
          //log ("returning test lists greater than this date" + (new Date(tDate)).toGMTString());
          //TODO hack hack hack
          tDate = Math.floor(tDate/1000);
          
        }
        if (branch != null) limiters += "&branch=" + branch;
        if (machine != null) limiters += "&machine=" + machine;
        if (testname != null) limiters += "&test=" + testname;

        if (getBuildID) limiters += "&graphby=buildid";

        //log("drequestTestList: " + getdatacgi + "type=discrete&datelimit=" + tDate + limiters);
        $.getJSON(getdatacgi + "/test/"+ limiters,
            function (obj) {
                if (!checkErrorReturn(obj)) return;
                self.testList = obj.tests;
                //log ("testlist: " + self.testList);
                callback.call(window, self.testList);
                  });
    },
    
    requestTestRuns : function(limitDate, testId, branchId, machineId, callback) {
        var self = this;
        var limiters = "id=" + testId + "&branchid=" + branchId + "&machineid=" + machineId;
        
        if(limitDate != null) {
            tDate = new Date().getTime();
            tDate -= limitDate * 86400 * 1000;
            tDate = Math.floor(tDate/1000);
            limiters += "&start="+tDate;
        }
        
        $.get(getdatacgi + "/test/runs?"+limiters, 
            function(resp) {
                var obj = (window.JSON) ? JSON.parse(resp) : eval('(' + resp + ')');
                
                if(!checkErrorReturn(obj)) return;
                self.testRuns = obj.test_runs;
                callback.call(window, self.testRuns);
        });
    },

    requestSearchList: function (branch, machine, testname, callback) {
        var self = this;
        limiters = ""; 
        if (branch != null) limiters += "&branch=" + branch;
        if (machine != null) limiters += "&machine=" + machine;
        if (testname != null) limiters += "&test=" + testname;
        //log(getdatacgi + "getlist=1&type=discrete" + limiters);
        $.getJSON(getdatacgi + "getlist=1&type=discrete" + limiters,
            function (obj) {
                if (!checkErrorReturn(obj)) return;
                callback.call(window, obj.results);
                  });
    },
};
function ExtraDataTinderboxData() {
};

ExtraDataTinderboxData.prototype = {
    __proto__: new TinderboxData(),
   
    init: function () {
    },
    
    requestTestList: function (limitDate, branch, machine, testname, callback) {
        var self = this;
        //netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect")
        var limiters = "";

        var tDate = 0;
        if (limitDate != null) {
          tDate = new Date().getTime();
          tDate -= limitDate * 86400 * 1000;
          //log ("returning test lists greater than this date" + (new Date(tDate)).toGMTString());
          //TODO hack hack hack
          tDate = Math.floor(tDate/1000)
          
        }
        if (branch != null) limiters += "&branch=" + branch;
        if (machine != null) limiters += "&machine=" + machine;
        if (testname != null) limiters += "&test=" + testname;
        //log("drequestTestList: " + getdatacgi + "type=discrete&datelimit=" + tDate + limiters);
        loadJSONDoc(getdatacgi + "type=discrete&graphby=bydata&datelimit=" + tDate + limiters)
        .addCallbacks(
            function (obj) {
                if (!checkErrorReturn(obj)) return;
                self.testList = obj.results;
                //log ("testlist: " + self.testList);
                callback.call(window, self.testList);
            },
            function () {alert ("requestTestList: Error talking to " + getdatacgi + ""); });
    },

    requestSearchList: function (branch, machine, testname, callback) {
        var self = this;
        limiters = ""; 
        if (branch != null) limiters += "&branch=" + branch;
        if (machine != null) limiters += "&machine=" + machine;
        if (testname != null) limiters += "&test=" + testname;
        //log(getdatacgi + "getlist=1&type=discrete" + limiters);
        loadJSONDoc(getdatacgi + "getlist=1&type=discrete" + limiters)
        .addCallbacks(
            function (obj) {
                if (!checkErrorReturn(obj)) return;
                callback.call(window, obj.results);
            },
            function () {alert ("requestSearchList: Error talking to " + getdatacgi); });
    },
    // arg1 = startTime, arg2 = endTime, arg3 = callback
    // arg1 = callback, arg2/arg3 == null
    requestDataSetFor: function (testId, arg1, arg2, arg3) {
        var self = this;

        var startTime = arg1;
        var endTime = arg2;
        var callback = arg3;

        var tempArray = new Array();
        tempArray = testId.split("_",2);
        testId = tempArray[0];
        var extradata = tempArray[1];

        if (arg1 && arg2 == null && arg3 == null) {
            callback = arg1;
            if (this.defaultLoadRange) {
                startTime = this.defaultLoadRange[0];
                endTime = this.defaultLoadRange[1];
                //log ("load range using default", startTime, endTime);
            } else {
                startTime = null;
                endTime = null;
            }
        }

        if (testId in this.testData) {
            var ds = this.testData[testId];
            //log ("Can maybe use cached?");
            if ((ds.requestedFirstTime == null && ds.requestedLastTime == null) ||
                (ds.requestedFirstTime <= startTime &&
                 ds.requestedLastTime >= endTime))
            {
                //log ("Using cached ds");
                callback.call (window, testId, ds);
                return;
            }

            // this can be optimized, if we request just the bookend bits,
            // but that's overkill
            if (ds.firstTime < startTime)
                startTime = ds.firstTime;
            if (ds.lastTime > endTime)
                endTime = ds.lastTime;
        }

        var cb = 
        function (event, aTID, aDS, aStartTime, aEndTime) {
            if (aTID != testId ||
                aStartTime > startTime ||
                aEndTime < endTime)
            {
                // not useful for us; there's another
                // outstanding request for our time range, so wait for that
                return;
            }

            $(self.eventTarget).unbind("tinderboxDataSetAvailable", cb);
            (event.data).call (window, aTID, aDS);
        };
        $(self.eventTarget).bind("tinderboxDataSetAvailable", callback, cb);

        //netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect")

        var reqstr = getdatacgi + "setid=" + testId;
        if (startTime)
            reqstr += "&starttime=" + startTime;
        if (endTime)
            reqstr += "&endtime=" + endTime;
        //raw data is the extra_data column
        if (this.raw)
            reqstr += "&raw=1";
        reqstr += "&graphby=bydata";
        reqstr += "&extradata=" + extradata;
        //log (reqstr);
        loadJSONDoc(reqstr)
        .addCallbacks(
            function (obj) {
                if (!checkErrorReturn(obj)) return;

                var ds = new TimeValueDataSet(obj.results);

                //this is the the case of a discrete graph - where the entire test run is always requested
                //so the start and end points are the first and last entries in the returned data set
                if  (!startTime && !endTime)  {
                    startTime = ds.data[0];
                    endTime = ds.data[ds.data.length -2];
                }
                ds.requestedFirstTime = startTime;
                ds.requestedLastTime = endTime;
                self.testData[testId] = ds;
                if (obj.annotations)
                    ds.annotations = new TimeStringDataSet(obj.annotations);
                if (obj.baselines)
                    ds.baselines = obj.baselines;
                if (obj.rawdata)
                    ds.rawdata = obj.rawdata;
                if (obj.stats)
                    ds.stats = obj.stats;
                $(self.eventTarget).trigger("tinderboxDataSetAvailable", [testId, ds, startTime, endTime]);
            },
            function (obj) {alert ("Error talking to " + getdatacgi + " (" + obj + ")"); log (obj.stack); });
    },
};
