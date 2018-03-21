// Code goes here


var app = angular.module('tsweb.LoanCalculator',[]);

app.directive('filter', ['$filter', function ($filter) {
  return {
    restrict: 'A',
    require: 'ngModel',
    link: function(scope, elem, attrs, ngModel) {
        
        var filterName = attrs.filter;
        
        var format = function(n) {
          return $filter(filterName)(n, '$');
        };
        
        ngModel.$formatters.unshift(format);
        
        ngModel.$parsers.unshift(function(viewValue) {
          var val = viewValue, tmp;
          switch (filterName) {
            case 'currency':
              tmp = Number(viewValue.replace(/[^0-9-\.]+/g, ""));
              val = (isNaN(tmp) ? undefined : tmp);
              break;
          }
          return val;
        });
        
        elem.on('blur', function () {
          elem.val(format(ngModel.$modelValue));
        });
    }
    
  }
}]);


// a filter to transform a number of months into a description of years and months
app.filter('inYearsMonths', function(){
  return function (numMonths) {
    var str = '';
    var years = Math.floor(numMonths / 12);
    var months = numMonths % 12;
    if (years) {
      str += years + ' year' + (years===1?'':'s') + ' ';
    }
    if (months > 0 || years == 0) {
      str += months + ' month' + (months===1?'':'s');
    }
    return str;
  };
});

// a filter to transform a number of months into a description of months
app.filter('inMonths', function(){
  return function (numMonths) {
    var str = '';
    str += numMonths + ' month' + (numMonths===1?'':'s');
    return str;
  };
});


app.service('Storage', ['$log', function ($log) {
  if (!window.localStorage) {
    $log.error('Browser does not support storage.');
    return null;
  }
  
  var ls = window.localStorage;
  
  return {
    getLength: function() {
        return ls.length;
    },
    key: function(i) {
      return ls.key(i);
    },
    getItem: function(key) {
      return ls.getItem(key);
    },
    setItem: function(key, value) {
      return ls.setItem(key, value);
    },
    removeItem: function(key) {
      return ls.removeItem(key);
    },
    clear: function() {
      return ls.clear();
    }
  }
}]);

// round a number to two decimal places
var roundCurrency = function(n) {
  return Math.round(n * 100) / 100;
};


app.controller('AppCtrl', ['$scope', 'Storage', function ($scope, Storage) {
  
  var pageData = {};
  
  // loan details
  $scope.loan = {
    amt: 1000,
    intRatePct: 6.55,
    monthlyPmt: 23.34,
    addtlMthlyPmt: 100
  };
  
  // a convenience variable for hiding the table view
  $scope.isBlank = true;
  
  $scope.loanChanged = loanChanged;
  $scope.run = run;
  
  // the maximum number of iterations to do, in case the loan minimum payment isn't met
  $scope.capMonths = 100 * 12; // 100 years
  
  // payoff records
  $scope.payoff = {
    // the remaining balance of the loan for that month
    monthBalance: {normal: [], extra: []},
    // the interest rate of the loan for that month
    monthInterestRate: {normal: [], extra: []},
    // the amount of interest accrued for that month
    monthInterestAccrued: {normal: [], extra: []},
    // minimum required payment for that month
    monthMinimumPayment: {normal: [], extra: []},
    // the amount paid toward this month's interest and balance 
    monthAmountPaid: {normal: [], extra: []},
    totalPaid: {normal: null, extra: null},
    totalInterest: {normal: null, extra: null}
  };
  
  if (Storage) {
    pageData = JSON.parse(Storage.getItem('loan'));
    if (pageData instanceof Object) {
      $scope.loan.amt = pageData.amt;
      $scope.loan.intRatePct = pageData.itr;
      $scope.loan.monthlyPmt = pageData.pmt;
      $scope.loan.addtlMthlyPmt = pageData.addtl;
    }
    else {
      pageData = {};
    }
  }
  
  
  
  // -----------------------------------------
  
  
  function amortizeScenario(scn, scenarioPayment) {
    // set up month 0
    var amt = $scope.loan.amt;
    $scope.payoff.monthBalance[scn][0] = amt;
    $scope.payoff.monthInterestRate[scn][0] = $scope.loan.intRatePct / 100 / 12;
    $scope.payoff.monthInterestAccrued[scn][0] = 0;
    $scope.payoff.monthMinimumPayment[scn][0] = $scope.loan.monthlyPmt;
    $scope.payoff.monthAmountPaid[scn][0] = 0;
    
    var totalPaid = totalInterest = 0;
    
    // each month represents day 1 of the month, and the interest accrued
    //   represents the interest accrued during the past month.
    
    var monthIdx = 1, pmt;
    while (amt > 0 && monthIdx < $scope.capMonths) {
      // For this month, ...
      // carry over things from the last month
      $scope.payoff.monthBalance[scn][monthIdx] = amt;
      $scope.payoff.monthInterestRate[scn][monthIdx] = $scope.payoff.monthInterestRate[scn][monthIdx-1];
      $scope.payoff.monthMinimumPayment[scn][monthIdx] = $scope.payoff.monthMinimumPayment[scn][monthIdx-1];
      // calculate interest for the past month
      $scope.payoff.monthInterestAccrued[scn][monthIdx] = roundCurrency(
        amt * $scope.payoff.monthInterestRate[scn][monthIdx]
      );
      // accrue interest to the balance
      $scope.payoff.monthBalance[scn][monthIdx] = roundCurrency($scope.payoff.monthBalance[scn][monthIdx] + $scope.payoff.monthInterestAccrued[scn][monthIdx]);
      
      // pay according to the scenario
      
      pmt = scenarioPayment({
          monthBalance: $scope.payoff.monthBalance[scn][monthIdx],
          monthMinimumPayment: $scope.payoff.monthMinimumPayment[scn][monthIdx],
        }, 
        monthIdx
      );
      
      totalPaid += pmt;
      // record the amount of interest paid. If the monthly payment is less, then that's it
      totalInterest += Math.min($scope.payoff.monthInterestAccrued[scn][monthIdx], pmt);
      
      // update the loan with the payment
      amt = $scope.payoff.monthBalance[scn][monthIdx] = roundCurrency($scope.payoff.monthBalance[scn][monthIdx] - pmt);
      $scope.payoff.monthAmountPaid[scn][monthIdx] = pmt;
      
      // increment month
      monthIdx++;
      
    }
    
    $scope.payoff.totalPaid[scn] = totalPaid;
    $scope.payoff.totalInterest[scn] = totalInterest;
    
  };
  
  function calculatePayoff() {
    clearPayoff();
    
    amortizeScenario('normal', function(amounts) {
      // pay minimum payment or the remaining amount
      return Math.min(amounts.monthMinimumPayment, amounts.monthBalance);
    });
    amortizeScenario('extra', function(amounts) {
      // pay payment or the remaining amount
      return Math.min(amounts.monthMinimumPayment + $scope.loan.addtlMthlyPmt, amounts.monthBalance);
    });
    
    $scope.isBlank = false;
  };
  
  // wipe the amortization scenarios 
  function clearPayoff() {
    var scenarios = ['normal', 'extra'];
    angular.forEach(scenarios, function(scn) {
      $scope.isBlank = true;
      $scope.payoff.monthBalance[scn] = [];
      $scope.payoff.monthInterestRate[scn] = [];
      $scope.payoff.monthInterestAccrued[scn] = [];
      $scope.payoff.monthMinimumPayment[scn] = [];
      $scope.payoff.monthAmountPaid[scn] = [];
    });
  };
  
  function loanChanged() {
    // clear the result table
    clearPayoff();
  };
  
  function run() {
    if (Storage) {
      saveData();
    }
    calculatePayoff();
  }
  
  function saveData() {
    if (Storage) {
      pageData.amt = $scope.loan.amt;
      pageData.itr = $scope.loan.intRatePct;
      pageData.pmt = $scope.loan.monthlyPmt;
      pageData.addtl = $scope.loan.addtlMthlyPmt;
      Storage.setItem('loan', JSON.stringify(pageData));
    }
  };
  
  
}]);



