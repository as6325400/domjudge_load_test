import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

let ip = "http://127.0.0.1:8080";

const users = new SharedArray('users', function() {
    let data = open('users.csv');
    return data.split(/\r?\n/).slice(1).map(line => {
        if (line.trim() === '') return;
        const [username, password] = line.split(',').map(s => s.trim()); 
        return { username, password };
    }).filter(user => user !== undefined);  
});


export let options = {
    vus: 1000,
    duration: '1m',  
    rps: 2000,  
};

export default function () {
    let user = users[__VU % users.length]; 
    let res = http.get(`${ip}/login`);

    check(res, {
        'login page retrieved': (r) => r.status === 200,
    });

    let csrfToken = res.html().find('input[name="_csrf_token"]').attr('value');

    check(csrfToken, {
        'CSRF token found': (token) => token !== '',
    });


    let loginPayload = {
        _username: user.username, 
        _password: user.password,  
        _csrf_token: csrfToken,    
    };

    let loginHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    let loginRes = http.post(`${ip}/login`, loginPayload, { headers: loginHeaders });

    let loginSuccess = check(loginRes, {
        'login success': (r) => r.status === 200,
    });

    if (!loginSuccess) {
        // login failed
        console.log(`Login failed for user: ${user.username}`);
        return;
    }

    console.log(`Login success for user: ${user.username}`);

    // 3. login success, then request team page
    for (let i = 0; i < 60; i++) {  // 60 requests in 1 minute
        let teamref = http.get(`${ip}/team`, {
            cookies: loginRes.cookies 
        });

        let teamSuccess = check(teamref, {
            'team page success': (r) => r.status === 200,
        });

        if (!teamSuccess) {
            console.log(`Team page request failed for user: ${user.username}`);
        } else {
            console.log(`Team page request success for user: ${user.username}`);
        }

        sleep(1);
    }
}
