@dashboard
Feature: Waiting for Pantheon workflows
  Every mutating operation waits until the workflows it started on the target
  environment are finished before the card settles.

  Scenario: Waits until running workflows finish
    Given a workflow on dev is "running" for two polls then "succeeded"
    When the host waits for dev
    Then it polls the workflow list three times
    And it resolves

  Scenario: A failed workflow fails the operation
    Given a workflow on dev "failed"
    When the host waits for dev
    Then it fails with "Pantheon workflow failed"

  Scenario: Workflows from before the operation are ignored
    Given a workflow on dev started long before the operation is "running"
    When the host waits for dev
    Then it resolves

  Scenario: Pantheon housekeeping workflows are ignored
    Given the "Update the Package Index Service" workflow on live is "running"
    And the deploy workflow on live "succeeded"
    When the host waits for live
    Then it resolves

  Scenario: Workflows on other environments are ignored
    Given a workflow on live is "running"
    When the host waits for test
    Then it resolves

  Scenario: Timing out reports the stuck workflows
    Given a workflow on dev stays "running"
    When the host waits for dev with a short timeout
    Then it fails with "Timed out waiting for workflows on dev"

  Scenario: Content clones get a 60 minute timeout
    When the host clones content
    Then it waits with a 60 minute timeout

  Scenario: Errors reach the card that started the operation
    Given a host operation fails with "stderr text"
    When the webview receives the error response
    Then the card that sent the request shows "stderr text"

  Scenario: A deploy started elsewhere shows the test spinner
    Given the dashboard is loaded and idle
    When Pantheon reports "Deploy code to test" running on test
    Then the test card shows a spinner naming the workflow
    And the test card is busy with its buttons disabled
    And the live card is untouched

  Scenario: The spinner clears on the first poll after the workflow finishes
    Given the test card shows a spinner for a workflow started elsewhere
    When the next poll reports no running workflows
    Then the workflow spinner is gone
    And the test pending commits are requested again
    And the test card is no longer busy

  Scenario: A running workflow on the selected multidev shows the dev spinner
    Given the dev card targets the multidev "themes"
    When Pantheon reports a workflow running on "themes"
    Then the dev card shows a spinner naming "themes"

  Scenario: Workflows on an env not shown on any card do not show a spinner
    Given the dashboard is loaded and the dev card targets "dev"
    When Pantheon reports a workflow running on "themes"
    Then no card shows a spinner

  Scenario: No poll while the panel is hidden
    Given the dashboard is loaded
    When the panel is hidden and 5 seconds pass
    Then no workflows request is sent

  Scenario: A card running its own operation is not taken over
    Given the test card is clearing caches
    When a poll reports a workflow running on test
    Then the card keeps its own spinner text
    When the operation settles
    Then the card is idle
    When the next poll reports no running workflows
    Then the card is still idle and shows no workflow spinner

  Scenario: A workflow that starts and finishes between polls refreshes the cards
    Given a poll recorded the newest finished workflow on dev
    When the next poll reports a newer finished workflow and none running
    Then the dev card is reloaded
    And the test and live pending commits are requested again

  Scenario: Workflows that ran while the panel was hidden refresh on the next visible poll
    Given a poll recorded the newest finished workflow on dev
    When the panel is hidden and time passes
    Then no workflows request is sent
    When the panel is visible again and the next poll reports a newer finished workflow
    Then the test and live pending commits are requested again

  Scenario: A failed workflow still refreshes the cards
    Given a poll recorded the newest finished workflow on test
    When the next poll reports a new finished id for a failed run on test
    Then the test pending commits are requested again

  Scenario: The first poll never refreshes
    Given the dashboard is loaded
    When the first poll reports finished workflows
    Then no card is reloaded

  Scenario: A watched workflow ending refreshes the card exactly once
    Given the test card shows a spinner for a workflow started elsewhere
    When the next poll reports no running workflows and a new finished id
    Then the test pending commits are requested once

  Scenario: A card running its own operation is not refreshed by a finished change
    Given a poll recorded the newest finished workflow on test
    And the test card is clearing caches
    When a poll reports a new finished id on test
    Then the test pending commits are not requested
    And the test card is still busy
