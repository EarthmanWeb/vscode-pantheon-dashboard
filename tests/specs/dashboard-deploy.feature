@dashboard
Feature: Deploying to Test and Live
  Test and Live cards list commits pending deployment and deploy with an
  inline confirm. Test deploys can sync content and clear caches afterwards;
  Live deploys can clear caches only.

  Scenario Outline: Pending commits for an environment
    Given the <source> code log has a commit labelled "<labels>"
    When the <env> card loads
    Then the commit <listed> pending for <env>

    Examples:
      | env  | source | labels          | listed |
      | test | dev    | dev             | is     |
      | test | dev    | test, live, dev | is not |
      | live | test   | test, dev       | is     |
      | live | test   | test, live, dev | is not |

  Scenario: Up-to-date environment
    Given nothing is pending for test
    When the test card loads
    Then the test card reads "Up to date with dev — nothing to deploy."
    And the badge reads "0 pending"

  Scenario: Deploy button requires a note and pending commits
    Given 1 commit is pending for test
    And the deploy note is empty
    Then the "Deploy Dev → Test" button is disabled
    When the user types note "Release"
    Then the "Deploy Dev → Test" button is enabled

  Scenario: Test deploy asks inline with sync options
    Given 1 commit is pending for test and the note is "Release"
    When the user clicks "Deploy Dev → Test"
    Then an inline confirm slides down reading "Deploy 1 commit(s) to TEST?"
    And it offers a "Sync from" source list, "Database", "Files" and "Clear caches afterwards", all unchecked
    And no spinner is shown

  Scenario: Live deploy asks inline with clear caches only
    Given 1 commit is pending for live and the note is "Release"
    When the user clicks "Deploy Test → Live"
    Then an inline confirm slides down reading "Deploy 1 commit(s) to LIVE?"
    And it offers "Clear caches afterwards" unchecked
    And it offers no "Sync from", "Database" or "Files" options

  Scenario: Cancelling a deploy
    Given the test deploy confirm is open
    When the user clicks "Cancel"
    Then nothing is deployed
    And the deploy note is kept

  Scenario: Deploy only
    Given the test deploy confirm is open with nothing ticked
    When the user clicks "Deploy"
    Then the host deploys to test with note "Release" and without clearing caches
    And the deploy note is cleared after the workflows complete
    And the live pending list reloads

  Scenario: Deploy with clear caches only
    Given the live deploy confirm is open with "Clear caches afterwards" ticked
    When the user clicks "Deploy"
    Then the host deploys to live with caches cleared

  Scenario: Test deploy then sync database and files
    Given the test deploy confirm is open
    And "Sync from" is "live" with "Database", "Files" and "Clear caches afterwards" ticked
    When the user clicks "Deploy"
    Then the host deploys to test without clearing caches and the deploy workflows complete
    And then database and files are cloned from "live" to "test" with caches cleared
    And the host waits for the clone workflows on "test"

  Scenario: Deploy failure still reloads downstream lists
    Given the deploy workflow fails
    When the user confirms a test deploy
    Then the test card shows "Pantheon workflow failed"
    And the live pending list reloads
