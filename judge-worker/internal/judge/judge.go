package judge

// Mental model of what the Docker SDK call looks like
func runContainer(ctx context.Context, input RunInput) RunOutput {
    // 1. Create container (don't start yet)
    container := docker.CreateContainer({
        Image:  "judge-" + input.Language + ":latest",
        Memory: input.MemoryLimitMb * 1024 * 1024,  // bytes
        CPUQuota: 50000,   // 0.5 CPU
        NetworkDisabled: true,
        ReadOnlyRootFS:  true,
        Tmpfs: {"/tmp": ""},
    })

    // 2. Attach stdin pipe BEFORE starting
    stdin := attachStdin(container)

    // 3. Start
    docker.StartContainer(container.ID)

    // 4. Write test case input to stdin, then close
    stdin.Write(input.TestCaseInput)
    stdin.Close()

    // 5. Wait with timeout — this is where wall-clock enforcement happens
    exitCode, err := waitWithTimeout(container.ID, input.TimeLimitMs + 2000)

    // 6. Capture stdout/stderr
    stdout, stderr := getLogs(container.ID)

    // 7. Always clean up — memory leak if you don't
    docker.RemoveContainer(container.ID, force=true)

    return RunOutput{stdout, stderr, exitCode, runtimeMs}
}