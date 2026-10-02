@dashboard
Feature: Session, site and environment selection
  The dashboard requires a Terminus login, resolves the Pantheon site for the
  workspace, and lists the site's multidev environments.

  Scenario: Logged-out user sees the login gate
    Given Terminus reports no authenticated user
    When the dashboard initializes
    Then the "Not logged in to Terminus" message is shown
    And the Terminus docs link is shown
    And a "Reload VS Code" button is shown

  Scenario: Reload button asks the host to reload the window
    Given the login gate is shown
    When the user clicks "Reload VS Code"
    Then the host runs the reload-window command

  Scenario: Configured site setting wins over folder matching
    Given the "pantheonDashboard.site" setting is "example-site"
    When the dashboard initializes
    Then the selected site is "example-site"

  Scenario Outline: Site resolved from the workspace folder name
    Given the site list is <sites>
    And the workspace folder is named "<folder>"
    When the site is resolved
    Then the selected site is <site>

    Examples:
      | sites                     | folder                | site         |
      | "acme-site, other"        | acme-site-master      | "acme-site"  |
      | "my-site"                 | unrelated-folder      | "my-site"    |
      | "a-site, b-site"          | unrelated-folder      | none         |

  Scenario: No resolvable site prompts for selection
    Given no site could be resolved
    When the dashboard renders
    Then every card shows "Select a site above."

  Scenario: Switching site refreshes every card
    Given the dashboard is showing site "example-site"
    When the user selects site "other-site"
    Then the dev, test and live cards reload for "other-site"

  Scenario: Multidev environments populate the dev selector
    Given the site has multidevs "themes" and "alpha"
    When the environments load
    Then the dev selector lists "dev", "alpha", "themes" in that order

  Scenario: Terminus failure during init is shown
    Given Terminus fails with "boom"
    When the dashboard initializes
    Then the error "boom" is shown
