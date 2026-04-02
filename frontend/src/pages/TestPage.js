import { useEffect, useState } from "react";

function TestPage(){

    // let's try making a timer that you can start and stop

    const [time, setTime] = useState(100);
    const [pause, setPause] = useState(false);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds/60);
        const hours = Math.floor(seconds/3600);
        const sec = seconds % 60;

        return `${hours.toString()}:${mins.toString()}:${sec.toString()}`
    }

    useEffect(() => {
        if (pause) return;

        const interval = setInterval(() => {
            setTime(prev => prev + 1)
        }, 1000)

        return () => clearInterval(interval)
    }, [pause])

    return (
        <div>
            <p>Time right now: {formatTime(time)}</p>
            <button onClick={() => setPause(prev => !prev)}>
                {pause ? 'Resume' : 'Pause'}
            </button>
        </div>
    )

}

export default TestPage;