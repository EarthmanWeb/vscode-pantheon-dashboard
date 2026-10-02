@dashboard
Feature: Unpushed local commits and pushing
  In Git mode the dev card lists local commits not yet pushed to origin,
  checks the local repo in the background, and pushes with an inline confirm
  that can also sync content and clear caches afterwards.

  Background:
    Given the dev environment is in "git" mode

  Scenario: Unpushed commits are listed with simplified wording
    Given local branch "master" has 1 commit not on origin
    When the dev card loads
    Then the status reads "1 unpushed local commit(s)"
    And the commit is listed with its message, short hash, date and author
    And the "Sync to Dev" button is enabled

  Scenario: Clean branch shows the matching state
    Given local branch "master" matches origin
    When the dev card loads
    Then the status reads "Status: Local master matches origin/master."
    And the "Sync to Dev" button is disabled

  Scenario: A multidev compares its own branch
    Given the dev selector is on multidev "themes"
    When the dev card loads
    Then unpushed commits are computed for "origin/themes..themes"

  Scenario: Refresh fetches origin first
    When the dev card loads
    Then git fetches origin before listing unpushed commits

  Scenario: Background check finds a new local commit without fetching
    Given the dev card shows 0 unpushed commits
    When a commit is made locally
    And 5 seconds pass
    Then the status reads "1 unpushed local commit(s)"
    And git did not fetch origin for the background check

  Scenario: Background check leaves an unchanged list alone
    Given the dev card shows 1 unpushed commit
    When 5 seconds pass with no new local commits
    Then the commit list is not re-rendered

  Scenario Outline: Background check pauses
    Given <condition>
    When 5 seconds pass
    Then no background check is sent

    Examples:
      | condition                        |
      | the dev environment is in SFTP mode |
      | the dev card is busy             |
      | the dashboard is hidden          |

  Scenario: Push asks inline before running
    Given local branch "master" has 2 unpushed commits
    When the user clicks "Sync to Dev"
    Then an inline confirm slides down reading "Push 2 commit(s) to origin/master? This deploys to dev."
    And it offers a "Sync from" source list, "Database", "Files" and "Clear caches afterwards", all unchecked
    And no spinner is shown

  Scenario: Push source list excludes the target
    Given the site has multidev "themes"
    When the push confirm opens for "dev"
    Then the "Sync from" list is "test", "live", "themes"

  Scenario: Cancelling the push
    Given the push confirm is open
    When the user clicks "Cancel"
    Then nothing is pushed
    And no spinner is shown

  Scenario: Push only
    Given the push confirm is open with nothing ticked
    When the user clicks "Push"
    Then git pushes "master" to origin
    And the host waits for the dev workflows
    And no content is cloned and no caches are cleared
    And the test and live pending lists reload

  Scenario: Push then sync database and clear caches
    Given the push confirm is open
    And "Sync from" is "live" with "Database" and "Clear caches afterwards" ticked
    When the user clicks "Push"
    Then git pushes "master" to origin and the dev workflows complete
    And then the database is cloned from "live" to "dev" with caches cleared
    And the host waits for the clone workflows on "dev"

  Scenario: Push then clear caches only
    Given the push confirm is open with only "Clear caches afterwards" ticked
    When the user clicks "Push"
    Then git pushes "master" to origin and the dev workflows complete
    And then caches are cleared on "dev"

  Scenario: Push failure is shown in the card
    Given git push fails with "rejected"
    When the user confirms the push
    Then the dev card shows the error "rejected"
