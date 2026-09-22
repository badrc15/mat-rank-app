window.App = window.App || {};

App.state = {
  me: null, // current fighter, once logged in
  activeTab: "profile",
  fighters: [], // roster cache
  requestsData: null, // { incoming, outgoing, canSendRequests }
  matchesData: null, // { matches, rivals }
  feedData: null, // { feed }

  ui: {
    authMode: "login", // 'login' | 'register'
    authError: null,
    authBusy: false,

    rosterView: "overall", // 'overall' | 'belt' | 'weight'
    rosterGender: "all", // 'all' | 'women' | 'men'
    rosterGym: "all",

    methodPromptFor: null, // matchId currently showing "how did you win" picker
    expandedFeedId: null, // matchId whose comments are expanded
    replyingTo: null, // commentId currently showing a reply box

    promotionNote: null, // transient banner after a belt change
  },
};
