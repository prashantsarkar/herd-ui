/*
* Copyright 2018 herd-ui contributors
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import { EncryptionService } from './../../shared/services/encryption.service';
import { Injectable } from '@angular/core';
import { CurrentUserService, UserAuthorizations, Configuration } from '@herd/angular-client'
import { Observable } from 'rxjs/Observable';
import { ConfigService } from 'app/core/services/config.service';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { Response, URLSearchParams } from '@angular/http'

@Injectable()
export class UserService {
  private _user: ReplaySubject<UserAuthorizations> = new ReplaySubject<UserAuthorizations>();
  get user(): Observable<UserAuthorizations> {
    return this._user.asObservable();
  }
  get isAuthenticated() {
    return this.userAuthorizations && this.userAuthorizations.userId
  }
  // User info returned from Herd
  userAuthorizations: UserAuthorizations;
  // encrypted user id
  encryptedUserIdentifier: string;

  constructor(private currentUserApi: CurrentUserService,
    private encryptionService: EncryptionService,
    private conf: ConfigService,
    private apiConf: Configuration) {
  }

  getCurrentUser(username?: string, password?: string): Observable<UserAuthorizations> {
    if (this.conf.config.useBasicAuth && username && password) {
      this.apiConf.username = username;
      this.apiConf.password = password;
    }
    // the added timestamp of the query string forces legacy browsers to not cache the http response
    // for current user.  this fixes current user differentiated tests.
    const search = new URLSearchParams(`v=${Date.now()}`.toString());
    return this.currentUserApi.currentUserGetCurrentUserWithHttpInfo({search}).map((res) => {
      this.userAuthorizations = res.json();
      this._user.next(res.json());
      this.encryptedUserIdentifier = this.encryptionService.encryptAndGet((res.json() as UserAuthorizations).userId);
      return res.json();
    });
  }

}
